"use client";

import { useReducer, useCallback, useRef } from "react";
import type { PipelineState, PipelineAction, FormInput } from "@/types/pipeline";
import type { ResearchOutput } from "@/types/research";
import type { YouTubeAnalysis } from "@/types/youtube";
import type { GenerationOutput } from "@/types/generation";

const initialState: PipelineState = {
  step: "idle",
  researchStatus: "",
  youtubeStatus: "",
  generationStatus: "",
  research: null,
  youtube: null,
  generation: null,
  error: null,
};

function pipelineReducer(state: PipelineState, action: PipelineAction): PipelineState {
  switch (action.type) {
    case "START":
      return {
        ...initialState,
        step: "research",
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
      return { ...state, step: "error", error: `Research failed: ${action.error}`, researchStatus: "Failed" };
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
      // YouTube is non-critical — continue without it
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
      };
    case "GENERATION_ERROR":
      return { ...state, step: "error", error: `Generation failed: ${action.error}`, generationStatus: "Failed" };
    case "RESET":
      return initialState;
    case "REGENERATE":
      return {
        ...state,
        step: "generation",
        generation: null,
        generationStatus: "Regenerating...",
        error: null,
      };
    default:
      return state;
  }
}

async function readSSEStream(
  response: Response,
  onStatus: (msg: string) => void,
  onComplete: (data: unknown) => void,
  onError: (msg: string) => void
) {
  const reader = response.body?.getReader();
  if (!reader) {
    onError("No response body");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

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
          onStatus(json.message);
        } else if (json.type === "complete") {
          onComplete(json.data);
        } else if (json.type === "error") {
          onError(json.message);
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }
}

export function useGenerationPipeline() {
  const [state, dispatch] = useReducer(pipelineReducer, initialState);
  const lastInputRef = useRef<FormInput | null>(null);
  const researchRef = useRef<ResearchOutput | null>(null);
  const youtubeRef = useRef<YouTubeAnalysis | null>(null);

  const runGeneration = useCallback(
    async (
      research: ResearchOutput,
      youtube: YouTubeAnalysis | null,
      formInput: FormInput
    ) => {
      dispatch({ type: "GENERATION_STATUS", status: "Generating copy..." });

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            research,
            youtubeAnalysis: youtube,
            transcript: formInput.transcript,
            episodeDescription: formInput.episodeDescription,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          dispatch({ type: "GENERATION_ERROR", error: err.error || "Generation request failed" });
          return;
        }

        await readSSEStream(
          res,
          (msg) => dispatch({ type: "GENERATION_STATUS", status: msg }),
          (data) => dispatch({ type: "GENERATION_COMPLETE", data: data as GenerationOutput }),
          (msg) => dispatch({ type: "GENERATION_ERROR", error: msg })
        );
      } catch (err) {
        dispatch({
          type: "GENERATION_ERROR",
          error: err instanceof Error ? err.message : "Generation failed",
        });
      }
    },
    []
  );

  const start = useCallback(
    async (formInput: FormInput) => {
      lastInputRef.current = formInput;
      researchRef.current = null;
      youtubeRef.current = null;
      dispatch({ type: "START" });

      let researchDone = false;
      let youtubeDone = false;

      const checkAndRunGeneration = () => {
        if (researchDone && youtubeDone && researchRef.current) {
          runGeneration(researchRef.current, youtubeRef.current, formInput);
        }
      };

      // Run research and YouTube analysis in parallel
      const researchPromise = (async () => {
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
          });

          if (!res.ok) {
            const err = await res.json();
            dispatch({ type: "RESEARCH_ERROR", error: err.error || "Research request failed" });
            return;
          }

          await readSSEStream(
            res,
            (msg) => dispatch({ type: "RESEARCH_STATUS", status: msg }),
            (data) => {
              researchRef.current = data as ResearchOutput;
              dispatch({ type: "RESEARCH_COMPLETE", data: data as ResearchOutput });
              researchDone = true;
              checkAndRunGeneration();
            },
            (msg) => dispatch({ type: "RESEARCH_ERROR", error: msg })
          );
        } catch (err) {
          dispatch({
            type: "RESEARCH_ERROR",
            error: err instanceof Error ? err.message : "Research failed",
          });
        }
      })();

      const youtubePromise = (async () => {
        if (!formInput.youtubeChannelUrl) {
          dispatch({ type: "YOUTUBE_STATUS", status: "Skipped (no channel URL)" });
          youtubeDone = true;
          checkAndRunGeneration();
          return;
        }

        try {
          const res = await fetch("/api/youtube-analysis", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channelUrl: formInput.youtubeChannelUrl,
              podcastTopic: formInput.episodeDescription,
            }),
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
          dispatch({
            type: "YOUTUBE_ERROR",
            error: err instanceof Error ? err.message : "YouTube analysis failed",
          });
          youtubeDone = true;
          checkAndRunGeneration();
        }
      })();

      await Promise.all([researchPromise, youtubePromise]);
    },
    [runGeneration]
  );

  const regenerate = useCallback(async () => {
    if (!researchRef.current || !lastInputRef.current) return;
    dispatch({ type: "REGENERATE" });
    await runGeneration(researchRef.current, youtubeRef.current, lastInputRef.current);
  }, [runGeneration]);

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  return {
    state,
    start,
    regenerate,
    reset,
    isRunning: state.step !== "idle" && state.step !== "complete" && state.step !== "error",
  };
}
