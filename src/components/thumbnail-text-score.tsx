"use client";

import type { ThumbnailTextScore } from "@/types/generation";

interface ThumbnailTextScoreChartProps {
  score: ThumbnailTextScore;
}

const dimensions: { key: keyof Omit<ThumbnailTextScore, "total">; label: string; max: number }[] = [
  { key: "curiosityGap", label: "Curiosity Gap", max: 25 },
  { key: "emotionalPunch", label: "Emotional Punch", max: 25 },
  { key: "titleComplement", label: "Title Complement", max: 25 },
  { key: "brevityAndClarity", label: "Brevity & Clarity", max: 25 },
];

function getBarColor(value: number, max: number): string {
  if (max <= 0) return "bg-red-500";
  const pct = value / max;
  if (pct >= 0.8) return "bg-emerald-500";
  if (pct >= 0.6) return "bg-blue-500";
  if (pct >= 0.4) return "bg-yellow-500";
  return "bg-red-500";
}

export function ThumbnailTextScoreChart({ score }: ThumbnailTextScoreChartProps) {
  return (
    <div className="space-y-2">
      {dimensions.map(({ key, label, max }) => {
        const value = score[key];
        const pct = (value / max) * 100;
        return (
          <div key={key} className="flex items-center gap-3 text-sm">
            <span className="w-40 text-muted-foreground truncate">{label}</span>
            <div
              className="flex-1 h-2 rounded-full bg-muted overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={max}
              aria-valuenow={value}
              aria-label={`${label}: ${value} out of ${max}`}
            >
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
