import { generateObject } from "ai";
import { pairwiseJudgeModel } from "./ai";
import { pairwiseOutputSchema } from "./schemas/pairwise-output";
import { buildPairwiseSystemPrompt, buildPairwiseUserPrompt } from "./prompts/pairwise-system";

export interface TitleWithScore {
  title: string;
  thumbnailText: string;
  score: { total: number };
}

interface PairComparisonResult {
  pair: { a: number; b: number };
  swap: boolean;
  winner: "A" | "B" | null;
}

interface TournamentResult {
  titles: TitleWithScore[];
  wins: Map<number, number>;
  consistentPairs: number;
}

/** Run tasks with bounded concurrency. */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      try {
        results[idx] = { status: "fulfilled", value: await tasks[idx]() };
      } catch (err) {
        results[idx] = { status: "rejected", reason: err };
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

const PAIRWISE_CONCURRENCY = 5;
const PAIRWISE_CALL_TIMEOUT_MS = 60_000;

export async function runPairwiseTournament(
  youtubeTitles: TitleWithScore[],
  episodeDescription: string,
  topN: number = 5,
  onProgress?: (completed: number, total: number) => void,
  signal?: AbortSignal
): Promise<TournamentResult | null> {
  const judgeModel = pairwiseJudgeModel;
  if (!judgeModel) {
    console.log("[Pairwise] No pairwiseJudgeModel configured, skipping tournament");
    return null;
  }

  const sortedByScore = [...youtubeTitles].sort(
    (a, b) => (b.score?.total || 0) - (a.score?.total || 0)
  );
  const topTitles = sortedByScore.slice(0, topN);

  if (topTitles.length < 2) {
    return null;
  }

  const pairs: Array<{ a: number; b: number }> = [];
  for (let i = 0; i < topTitles.length; i++) {
    for (let j = i + 1; j < topTitles.length; j++) {
      pairs.push({ a: i, b: j });
    }
  }

  const comparisons: Array<{
    pair: { a: number; b: number };
    swap: boolean;
    titleA: TitleWithScore;
    titleB: TitleWithScore;
  }> = [];

  for (const pair of pairs) {
    comparisons.push({
      pair,
      swap: false,
      titleA: topTitles[pair.a],
      titleB: topTitles[pair.b],
    });
    comparisons.push({
      pair,
      swap: true,
      titleA: topTitles[pair.b],
      titleB: topTitles[pair.a],
    });
  }

  let completedCount = 0;

  const tasks = comparisons.map((comp) => async (): Promise<PairComparisonResult> => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PAIRWISE_CALL_TIMEOUT_MS);
      if (signal?.aborted) {
        clearTimeout(timeout);
        throw new Error("Aborted");
      }
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort);
      try {
        const result = await generateObject({
          model: judgeModel,
          schema: pairwiseOutputSchema,
          system: buildPairwiseSystemPrompt(),
          prompt: buildPairwiseUserPrompt({
            episodeDescription,
            titleA: comp.titleA.title,
            thumbnailTextA: comp.titleA.thumbnailText,
            titleB: comp.titleB.title,
            thumbnailTextB: comp.titleB.thumbnailText,
          }),
          abortSignal: controller.signal,
        });
        return { ...comp, winner: result.object.winner };
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
        try {
          completedCount++;
          onProgress?.(completedCount, comparisons.length);
        } catch (progressErr) {
          console.error("[Pairwise] onProgress callback error:", progressErr);
        }
      }
    } catch (err) {
      console.warn("[Pairwise] Comparison failed:", err instanceof Error ? err.message : err);
      return { ...comp, winner: null };
    }
  });

  const results = await runWithConcurrency(tasks, PAIRWISE_CONCURRENCY);

  const typedResults = results as PromiseSettledResult<PairComparisonResult>[];

  const wins = new Map<number, number>();
  let consistentPairs = 0;

  for (const pair of pairs) {
    const original = typedResults.find(
      (r) =>
        r.status === "fulfilled" &&
        r.value.pair.a === pair.a &&
        r.value.pair.b === pair.b &&
        !r.value.swap
    );
    const swapped = typedResults.find(
      (r) =>
        r.status === "fulfilled" &&
        r.value.pair.a === pair.a &&
        r.value.pair.b === pair.b &&
        r.value.swap
    );

    const originalWinner = original?.status === "fulfilled" ? original.value.winner : null;
    const swappedWinner = swapped?.status === "fulfilled" ? swapped.value.winner : null;

    if (originalWinner === "A" && swappedWinner === "B") {
      const winnerIdx = pair.a;
      wins.set(winnerIdx, (wins.get(winnerIdx) || 0) + 1);
      consistentPairs++;
    } else if (originalWinner === "B" && swappedWinner === "A") {
      const winnerIdx = pair.b;
      wins.set(winnerIdx, (wins.get(winnerIdx) || 0) + 1);
      consistentPairs++;
    }
  }

  return {
    titles: topTitles,
    wins,
    consistentPairs,
  };
}
