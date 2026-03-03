"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreBadge } from "@/components/score-badge";
import type { TitleOption } from "@/types/generation";

interface ScoreComparisonProps {
  titles: TitleOption[];
  platform: "youtube" | "spotify";
}

const DIMENSIONS = [
  { key: "curiosityGap", label: "Curiosity Gap", max: 20 },
  { key: "authoritySignal", label: "Authority", max: 15 },
  { key: "emotionalTrigger", label: "Emotion", max: 15 },
  { key: "trendingKeyword", label: "Trending", max: 10 },
  { key: "specificity", label: "Specificity", max: 10 },
  { key: "characterCount", label: "Char Count", max: 10 },
  { key: "wordBalance", label: "Word Balance", max: 10 },
  { key: "frontLoadHook", label: "Front-Load", max: 5 },
  { key: "platformFit", label: "Platform Fit", max: 5 },
] as const;

const COLORS = [
  "bg-red-400",
  "bg-blue-400",
  "bg-emerald-400",
  "bg-amber-400",
];

export function ScoreComparison({ titles, platform }: ScoreComparisonProps) {
  if (titles.length < 2) return null;

  const highestTotal = Math.max(...titles.map(t => t.score.total));

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          Score Comparison ({platform === "youtube" ? "YouTube" : "Spotify"})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Legend */}
        <div className="flex flex-wrap gap-3">
          {titles.map((t, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${COLORS[i % COLORS.length]}`} />
              <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                #{i + 1}: {t.title.slice(0, 40)}...
              </span>
              <ScoreBadge score={t.score.total} showLabel={false} />
              {t.score.total === highestTotal && (
                <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-amber-500/20 text-amber-400">
                  Winner
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Dimension bars */}
        <div className="space-y-2.5">
          {DIMENSIONS.map(dim => (
            <div key={dim.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground">{dim.label}</span>
                <span className="text-[10px] text-muted-foreground">/{dim.max}</span>
              </div>
              <div className="space-y-0.5">
                {titles.map((t, i) => {
                  const val = (t.score as unknown as Record<string, number>)[dim.key] || 0;
                  const pct = (val / dim.max) * 100;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-full bg-muted/50 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${COLORS[i % COLORS.length]}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground w-5 text-right">
                        {val}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Pairwise ranking */}
        {titles.some(t => t.pairwiseRank !== undefined) && (
          <div className="pt-2 border-t border-border/50">
            <p className="text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Pairwise Ranking</p>
            <div className="flex gap-2">
              {titles
                .filter(t => t.pairwiseRank !== undefined)
                .sort((a, b) => (a.pairwiseRank || 0) - (b.pairwiseRank || 0))
                .map((t, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground">
                    #{t.pairwiseRank} ({t.pairwiseWins}W)
                  </span>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
