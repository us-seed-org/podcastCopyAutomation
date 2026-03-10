"use client";

import { useReducer, useCallback } from "react";
import type {
  ThumbnailState,
  ThumbnailStage,
  ChannelStyle,
  ThumbnailResult,
} from "@/types/thumbnail";

const initialState: ThumbnailState = {
  stage: "idle",
  channelStyle: null,
  existingThumbnails: [],
  channelName: "",
  generatedThumbnails: [],
  error: null,
};

type Action =
  | { type: "RESET" }
  | { type: "SET_STAGE"; stage: ThumbnailStage; error?: string }
  | {
      type: "SET_ANALYSIS";
      channelStyle: ChannelStyle;
      thumbnailUrls: string[];
      channelName: string;
    }
  | { type: "SET_GENERATED"; thumbnails: ThumbnailResult[] };

function reducer(state: ThumbnailState, action: Action): ThumbnailState {
  switch (action.type) {
    case "RESET":
      return initialState;
    case "SET_STAGE":
      return { ...state, stage: action.stage, error: action.error ?? null };
    case "SET_ANALYSIS":
      return {
        ...state,
        stage: "analyzed",
        channelStyle: action.channelStyle,
        existingThumbnails: action.thumbnailUrls,
        channelName: action.channelName,
        error: null,
      };
    case "SET_GENERATED":
      return {
        ...state,
        stage: "complete",
        generatedThumbnails: action.thumbnails,
        error: null,
      };
    default:
      return state;
  }
}

interface GuestConfig {
  name: string;
  headshotBase64?: string;
}

interface GenerateThumbnailsConfig {
  titleText: string;
  thumbnailText?: string;
  guests?: GuestConfig[];
  existingThumbnailUrls?: string[];
  generateCount?: number;
}

export function useThumbnailPipeline() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const analyzeChannel = useCallback(async (channelUrl: string) => {
    dispatch({ type: "SET_STAGE", stage: "analyzing" });

    try {
      const resp = await fetch("/api/analyze-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelUrl }),
      });

      if (!resp.ok) {
        const data = await resp
          .json()
          .catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(data.error || `Analysis failed (${resp.status})`);
      }

      const data = await resp.json();
      dispatch({
        type: "SET_ANALYSIS",
        channelStyle: data.channelStyle,
        thumbnailUrls: data.thumbnailUrls,
        channelName: data.channelName,
      });
    } catch (err) {
      dispatch({
        type: "SET_STAGE",
        stage: "error",
        error: err instanceof Error ? err.message : "Analysis failed",
      });
    }
  }, []);

  const generateThumbnails = useCallback(
    async (config: GenerateThumbnailsConfig) => {
      if (!state.channelStyle) {
        dispatch({
          type: "SET_STAGE",
          stage: "error",
          error: "Channel style not analyzed yet. Please analyze a channel first.",
        });
        return;
      }

      dispatch({ type: "SET_STAGE", stage: "generating" });

      try {
        const { existingThumbnailUrls, ...restConfig } = config;
        const resp = await fetch("/api/generate-thumbnails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channelStyle: state.channelStyle,
            existingThumbnailUrls:
              existingThumbnailUrls ?? state.existingThumbnails,
            ...restConfig,
          }),
        });

        if (!resp.ok) {
          const data = await resp
            .json()
            .catch(() => ({ error: `HTTP ${resp.status}` }));
          throw new Error(
            data.error || `Generation failed (${resp.status})`
          );
        }

        const data = await resp.json();
        dispatch({ type: "SET_GENERATED", thumbnails: data.thumbnails });
      } catch (err) {
        dispatch({
          type: "SET_STAGE",
          stage: "error",
          error: err instanceof Error ? err.message : "Generation failed",
        });
      }
    },
    [state.channelStyle, state.existingThumbnails]
  );

  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  return { state, analyzeChannel, generateThumbnails, reset };
}
