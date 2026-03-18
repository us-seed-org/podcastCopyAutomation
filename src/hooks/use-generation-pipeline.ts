"use client";

import { useReducer, useCallback, useRef, useState } from "react";
import type { PipelineAction, PipelineState, FormInput } from "@/types/pipeline";
import type { ResearchOutput } from "@/types/research";
import type { YouTubeAnalysis } from "@/types/youtube";
import type {
  GenerationOutput,
  GenerationRequestPayload,
  GenerationMode,
  RerunMode,
  TitleArchetype,
} from "@/types/generation";
import type { PipelineSummary, PipelineTraceEntry } from "@/types/pipeline-trace";

const initialState: PipelineState = {
  step: "idle",
  activeMode: null,
  researchStatus: "",
  youtubeStatus: "",
  generationStatus: "",
  research: null,
  youtube: null,
  generation: null,
  error: null,
  isRegenerating: false,
  traceEntries: [],
  pipelineSummary: null,
};

function pipelineReducer(state: PipelineState, action: PipelineAction): PipelineState {
  switch (action.type) {
    case "START":
      return {
        ...initialState,
        step: "research",
        activeMode: "full",
        researchStatus: "Starting research...",
        youtubeStatus: "Fetching channel data...",
      };
    case "RESEARCH_STATUS":
      return { ...state, researchStatus: action.status };
    case "RESEARCH_COMPLETE":
      return {
        ...state,
        research: action.data,
        researchStatus: "Research complete",
        step: state.youtube !== null || !state.youtubeStatus ? "generation" : state.step,
      };
    case "RESEARCH_ERROR":
      return {
        ...state,
        step: "error",
        activeMode: null,
        error: `Research failed: ${action.error}`,
        researchStatus: "Failed",
        isRegenerating: false,
      };
    case "YOUTUBE_STATUS":
      return { ...state, youtubeStatus: action.status };
    case "YOUTUBE_COMPLETE":
      return {
        ...state,
        youtube: action.data,
        youtubeStatus: "Analysis complete",
        step: state.research !== null ? "generation" : state.step,
      };
    case "YOUTUBE_ERROR":
      return {
        ...state,
        youtube: null,
        youtubeStatus: "Skipped (no channel data)",
        step: state.research !== null ? "generation" : state.step,
      };
    case "GENERATION_STATUS":
      return { ...state, generationStatus: action.status };
    case "GENERATION_COMPLETE":
      return {
        ...state,
        generation: action.data,
        generationStatus: "Generation complete",
        step: "complete",
        activeMode: null,
        isRegenerating: false,
      };
    case "GENERATION_ERROR":
      if (action.preserveResults && state.generation) {
        return {
          ...state,
          step: "complete",
          activeMode: null,
          error: `Generation failed: ${action.error}`,
          generationStatus: "Failed",
          isRegenerating: false,
        };
      }
      return {
        ...state,
        step: "error",
        activeMode: null,
        error: `Generation failed: ${action.error}`,
        generationStatus: "Failed",
        isRegenerating: false,
      };
    case "RESET":
      return initialState;
    case "REGENERATE":
      return {
        ...state,
        step: state.generation ? "complete" : "generation",
        activeMode: action.mode,
        generationStatus: action.status,
        error: null,
        isRegenerating: true,
        traceEntries: [],
        pipelineSummary: null,
      };
    case "CANCEL":
      return {
        ...state,
        step: state.generation ? "complete" : "idle",
        activeMode: null,
        generationStatus: "Cancelled.",
        error: null,
        isRegenerating: false,
      };
    case "PIPELINE_TRACE":
      return {
        ...state,
        traceEntries: [...state.traceEntries, action.entry],
      };
    case "PIPELINE_SUMMARY":
      return {
        ...state,
        pipelineSummary: action.summary,
      };
    default:
      return state;
  }
}

interface SSEResult {
  receivedComplete: boolean;
  receivedError: boolean;
  runId: string | null;
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

async function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return;
  }
  if (signal.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function readSSEStream(
  response: Response,
  callbacks: {
    onStatus: (msg: string) => void;
    onComplete: (data: unknown) => void;
    onError: (msg: string) => void;
    onTrace?: (entry: unknown) => void;
    onSummary?: (summary: unknown) => void;
    onRunId?: (runId: string) => void;
  }
): Promise<SSEResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError("No response body");
    return { receivedComplete: false, receivedError: true, runId: null };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let receivedComplete = false;
  let receivedError = false;
  let runId: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const dataLine = line.trim();
      if (!dataLine.startsWith("data: ")) continue;

      try {
        const json = JSON.parse(dataLine.slice(6));
        if (json.type === "status") {
          callbacks.onStatus(json.message);
        } else if (json.type === "complete") {
          receivedComplete = true;
          callbacks.onComplete(json.data);
        } else if (json.type === "error") {
          receivedError = true;
          callbacks.onError(json.message);
        } else if (json.type === "pipeline_trace" && callbacks.onTrace) {
          callbacks.onTrace(json.entry);
        } else if (json.type === "pipeline_summary" && callbacks.onSummary) {
          callbacks.onSummary(json.summary);
        } else if (json.type === "run_id" && json.runId) {
          runId = json.runId;
          if (callbacks.onRunId) callbacks.onRunId(json.runId);
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }

  return { receivedComplete, receivedError, runId };
}

/**
 * Poll the /api/generate/status endpoint until the pipeline completes or errors.
 * Used as a fallback when the SSE stream is cut by platform timeouts.
 */
async function pollForResult(
  runId: string,
  callbacks: {
    onStatus: (msg: string) => void;
    onComplete: (data: GenerationOutput) => void;
    onError: (msg: string) => void;
    onSummary?: (summary: unknown) => void;
  },
  options?: {
    signal?: AbortSignal;
    maxAttempts?: number;
    intervalMs?: number;
  }
): Promise<void> {
  const maxAttempts = options?.maxAttempts ?? 120;
  const intervalMs = options?.intervalMs ?? 3000;

  callbacks.onStatus("Stream interrupted — polling for results (pipeline still running on server)...");

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleepWithAbort(intervalMs, options?.signal);

    try {
      const res = await fetch(`/api/generate/status?runId=${runId}`, {
        signal: options?.signal,
      });
      if (!res.ok) continue;

      const data = await res.json();

      if (data.status === "complete" && data.output) {
        if (data.summary && callbacks.onSummary) {
          callbacks.onSummary(data.summary);
        }
        callbacks.onComplete(data.output as GenerationOutput);
        return;
      } else if (data.status === "error") {
        callbacks.onError("Pipeline failed on server");
        return;
      }
      callbacks.onStatus(`Pipeline still running on server (${attempt + 1}/${maxAttempts})...`);
    } catch (err) {
      if (isAbortError(err)) throw err;
      // Network error during poll — continue trying
    }
  }

  callbacks.onError("Pipeline timed out — server did not complete within the expected time.");
}

export function useGenerationPipeline() {
  const [state, dispatch] = useReducer(pipelineReducer, initialState);
  const [regeneratingArchetype, setRegeneratingArchetype] = useState<TitleArchetype | null>(null);
  const [rerunningMode, setRerunningMode] = useState<RerunMode | null>(null);

  const lastInputRef = useRef<FormInput | null>(null);
  const researchRef = useRef<ResearchOutput | null>(null);
  const youtubeRef = useRef<YouTubeAnalysis | null>(null);
  const activeControllersRef = useRef<Set<AbortController>>(new Set());
  const cancelledRef = useRef(false);

  const createAbortController = useCallback(() => {
    const controller = new AbortController();
    activeControllersRef.current.add(controller);
    return controller;
  }, []);

  const releaseAbortController = useCallback((controller: AbortController) => {
    activeControllersRef.current.delete(controller);
  }, []);

  const abortAllActive = useCallback(() => {
    for (const controller of activeControllersRef.current) {
      controller.abort();
    }
    activeControllersRef.current.clear();
  }, []);

  const runGeneration = useCallback(
    async (
      payload: GenerationRequestPayload,
      options?: { preserveResultsOnError?: boolean }
    ) => {
      const controller = createAbortController();

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json();
          dispatch({
            type: "GENERATION_ERROR",
            error: err.error || "Generation request failed",
            preserveResults: options?.preserveResultsOnError,
          });
          return;
        }

        let capturedRunId: string | null = null;

        const sseResult = await readSSEStream(res, {
          onStatus: (msg) => dispatch({ type: "GENERATION_STATUS", status: msg }),
          onComplete: (data) => dispatch({ type: "GENERATION_COMPLETE", data: data as GenerationOutput }),
          onError: (msg) =>
            dispatch({
              type: "GENERATION_ERROR",
              error: msg,
              preserveResults: options?.preserveResultsOnError,
            }),
          onTrace: (entry: unknown) => {
            if (entry && typeof entry === "object") {
              const entryObj = entry as Partial<PipelineTraceEntry>;
              dispatch({
                type: "PIPELINE_TRACE",
                entry: {
                  ...entryObj,
                  id: entryObj.id ?? crypto.randomUUID(),
                } as PipelineTraceEntry,
              });
            }
          },
          onSummary: (summary) =>
            dispatch({
              type: "PIPELINE_SUMMARY",
              summary: summary as PipelineSummary,
            }),
          onRunId: (id) => {
            capturedRunId = id;
          },
        });

        if (
          !sseResult.receivedComplete &&
          !sseResult.receivedError &&
          capturedRunId
        ) {
          await pollForResult(
            capturedRunId,
            {
              onStatus: (msg) => dispatch({ type: "GENERATION_STATUS", status: msg }),
              onComplete: (data) => dispatch({ type: "GENERATION_COMPLETE", data }),
              onError: (msg) =>
                dispatch({
                  type: "GENERATION_ERROR",
                  error: msg,
                  preserveResults: options?.preserveResultsOnError,
                }),
              onSummary: (summary) =>
                dispatch({
                  type: "PIPELINE_SUMMARY",
                  summary: summary as PipelineSummary,
                }),
            },
            { signal: controller.signal }
          );
        } else if (!sseResult.receivedComplete && !sseResult.receivedError) {
          dispatch({
            type: "GENERATION_ERROR",
            error:
              "Connection lost — the server stream ended before completing. This usually means the hosting platform terminated the request.",
            preserveResults: options?.preserveResultsOnError,
          });
        }
      } catch (err) {
        if (isAbortError(err)) return;
        dispatch({
          type: "GENERATION_ERROR",
          error: err instanceof Error ? err.message : "Generation failed",
          preserveResults: options?.preserveResultsOnError,
        });
      } finally {
        releaseAbortController(controller);
      }
    },
    [createAbortController, releaseAbortController]
  );

  const start = useCallback(
    async (formInput: FormInput) => {
      cancelledRef.current = false;
      abortAllActive();
      setRegeneratingArchetype(null);
      setRerunningMode(null);

      lastInputRef.current = formInput;
      researchRef.current = null;
      youtubeRef.current = null;
      dispatch({ type: "START" });

      let researchDone = false;
      let youtubeDone = false;

      const checkAndRunGeneration = () => {
        if (cancelledRef.current) return;
        if (researchDone && youtubeDone && researchRef.current) {
          runGeneration(
            {
              research: researchRef.current,
              youtubeAnalysis: youtubeRef.current,
              transcript: formInput.transcript,
              episodeDescription: formInput.episodeDescription,
              mode: "full",
            },
            { preserveResultsOnError: true }
          );
        }
      };

      const researchPromise = (async () => {
        const controller = createAbortController();
        try {
          const res = await fetch("/api/research", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              guestName: formInput.guestName,
              podcastName: formInput.podcastName,
              episodeDescription: formInput.episodeDescription,
              transcript: formInput.transcript,
              coHosts: formInput.coHosts,
              targetAudience: formInput.targetAudience,
            }),
            signal: controller.signal,
          });

          if (!res.ok) {
            const err = await res.json();
            dispatch({ type: "RESEARCH_ERROR", error: err.error || "Research request failed" });
            return;
          }

          await readSSEStream(res, {
            onStatus: (msg) => dispatch({ type: "RESEARCH_STATUS", status: msg }),
            onComplete: (data) => {
              researchRef.current = data as ResearchOutput;
              dispatch({ type: "RESEARCH_COMPLETE", data: data as ResearchOutput });
              researchDone = true;
              checkAndRunGeneration();
            },
            onError: (msg) => dispatch({ type: "RESEARCH_ERROR", error: msg }),
          });
        } catch (err) {
          if (isAbortError(err)) return;
          dispatch({
            type: "RESEARCH_ERROR",
            error: err instanceof Error ? err.message : "Research failed",
          });
        } finally {
          releaseAbortController(controller);
        }
      })();

      const youtubePromise = (async () => {
        if (!formInput.youtubeChannelUrl) {
          dispatch({ type: "YOUTUBE_STATUS", status: "Skipped (no channel URL)" });
          youtubeDone = true;
          checkAndRunGeneration();
          return;
        }

        const controller = createAbortController();
        try {
          const res = await fetch("/api/youtube-analysis", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channelUrl: formInput.youtubeChannelUrl,
              podcastTopic: formInput.episodeDescription,
            }),
            signal: controller.signal,
          });

          if (!res.ok) {
            dispatch({ type: "YOUTUBE_ERROR", error: "YouTube analysis failed" });
            youtubeDone = true;
            checkAndRunGeneration();
            return;
          }

          const data = await res.json();
          if (data.error) {
            dispatch({ type: "YOUTUBE_ERROR", error: data.error });
          } else {
            youtubeRef.current = data as YouTubeAnalysis;
            dispatch({ type: "YOUTUBE_COMPLETE", data: data as YouTubeAnalysis });
          }
          youtubeDone = true;
          checkAndRunGeneration();
        } catch (err) {
          if (isAbortError(err)) return;
          dispatch({
            type: "YOUTUBE_ERROR",
            error: err instanceof Error ? err.message : "YouTube analysis failed",
          });
          youtubeDone = true;
          checkAndRunGeneration();
        } finally {
          releaseAbortController(controller);
        }
      })();

      await Promise.all([researchPromise, youtubePromise]);
    },
    [abortAllActive, createAbortController, releaseAbortController, runGeneration]
  );

  const buildGenerationPayload = useCallback(
    (
      mode: GenerationMode,
      generation: GenerationOutput,
      targetArchetype?: TitleArchetype
    ): GenerationRequestPayload | null => {
      if (!researchRef.current || !lastInputRef.current) return null;

      return {
        research: researchRef.current,
        youtubeAnalysis: youtubeRef.current,
        transcript: lastInputRef.current.transcript,
        episodeDescription: lastInputRef.current.episodeDescription,
        mode,
        existingGeneration: generation,
        targetArchetype,
      };
    },
    []
  );

  const regenerate = useCallback(async () => {
    if (!state.generation) return;
    const payload = buildGenerationPayload("full", state.generation);
    if (!payload) return;

    cancelledRef.current = false;
    abortAllActive();
    setRegeneratingArchetype(null);
    setRerunningMode(null);
    dispatch({ type: "REGENERATE", mode: "full", status: "Regenerating all passes..." });
    await runGeneration(payload, { preserveResultsOnError: true });
  }, [abortAllActive, buildGenerationPayload, runGeneration, state.generation]);

  const regenerateTitle = useCallback(
    async (archetype: TitleArchetype) => {
      if (!state.generation) return;
      const payload = buildGenerationPayload("regenerate_title", state.generation, archetype);
      if (!payload) return;

      cancelledRef.current = false;
      abortAllActive();
      setRegeneratingArchetype(archetype);
      setRerunningMode(null);
      dispatch({
        type: "REGENERATE",
        mode: "regenerate_title",
        status: `Regenerating ${archetype} title...`,
      });
      try {
        await runGeneration(payload, { preserveResultsOnError: true });
      } finally {
        setRegeneratingArchetype(null);
      }
    },
    [abortAllActive, buildGenerationPayload, runGeneration, state.generation]
  );

  const rerunPass = useCallback(
    async (mode: RerunMode) => {
      if (!state.generation) return;
      const payload = buildGenerationPayload(mode, state.generation);
      if (!payload) return;

      cancelledRef.current = false;
      abortAllActive();
      setRegeneratingArchetype(null);
      setRerunningMode(mode);
      const statusMap: Record<RerunMode, string> = {
        rescore: "Re-running scoring...",
        rerank: "Re-running pairwise ranking...",
        recontent: "Re-running descriptions and chapters...",
      };
      dispatch({ type: "REGENERATE", mode, status: statusMap[mode] });
      try {
        await runGeneration(payload, { preserveResultsOnError: true });
      } finally {
        setRerunningMode(null);
      }
    },
    [abortAllActive, buildGenerationPayload, runGeneration, state.generation]
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    abortAllActive();
    setRegeneratingArchetype(null);
    setRerunningMode(null);
    dispatch({ type: "CANCEL" });
  }, [abortAllActive]);

  const reset = useCallback(() => {
    cancelledRef.current = false;
    abortAllActive();
    setRegeneratingArchetype(null);
    setRerunningMode(null);
    dispatch({ type: "RESET" });
  }, [abortAllActive]);

  return {
    state,
    start,
    regenerate,
    regenerateTitle,
    rerunPass,
    cancel,
    reset,
    isRunning: state.step !== "idle" && state.step !== "complete" && state.step !== "error",
    isRegenerating: state.isRegenerating,
    regeneratingArchetype,
    rerunningMode,
    activeMode: state.activeMode,
  };
}
