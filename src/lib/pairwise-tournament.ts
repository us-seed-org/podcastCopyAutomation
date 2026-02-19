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

export async function runPairwiseTournament(
  youtubeTitles: TitleWithScore[],
  episodeDescription: string,
  topN: number = 6
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

  const results = await Promise.allSettled(
    comparisons.map(async (comp) => {
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
        });
        return { ...comp, winner: result.object.winner };
      } catch (err) {
        console.warn("[Pairwise] Comparison failed:", err);
        return { ...comp, winner: null };
      }
    })
  );

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
