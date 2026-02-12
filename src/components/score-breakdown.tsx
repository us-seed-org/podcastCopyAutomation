"use client";

import type { ScoreBreakdown } from "@/types/generation";

interface ScoreBreakdownProps {
  score: ScoreBreakdown;
}

const dimensions: { key: keyof Omit<ScoreBreakdown, "total">; label: string; max: number }[] = [
  { key: "curiosityGap", label: "Curiosity Gap", max: 20 },
  { key: "authoritySignal", label: "Authority Signal", max: 15 },
  { key: "emotionalTrigger", label: "Emotional Trigger", max: 15 },
  { key: "trendingKeyword", label: "Trending Keyword", max: 10 },
  { key: "specificity", label: "Specificity", max: 10 },
  { key: "characterCount", label: "Character Count", max: 10 },
  { key: "wordBalance", label: "Word Balance", max: 10 },
  { key: "frontLoadHook", label: "Front-Load Hook", max: 5 },
  { key: "thumbnailComplement", label: "Thumbnail Complement", max: 5 },
];

function getBarColor(value: number, max: number): string {
  const pct = value / max;
  if (pct >= 0.8) return "bg-emerald-500";
  if (pct >= 0.6) return "bg-blue-500";
  if (pct >= 0.4) return "bg-yellow-500";
  return "bg-red-500";
}

export function ScoreBreakdownChart({ score }: ScoreBreakdownProps) {
  return (
    <div className="space-y-2">
      {dimensions.map(({ key, label, max }) => {
        const value = score[key];
        const pct = (value / max) * 100;
        return (
          <div key={key} className="flex items-center gap-3 text-sm">
            <span className="w-40 text-muted-foreground truncate">{label}</span>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${getBarColor(value, max)}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-12 text-right font-mono text-xs">
              {value}/{max}
            </span>
          </div>
        );
      })}
    </div>
  );
}
