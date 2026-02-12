import { Badge } from "@/components/ui/badge";
import { getScoreBgColor, getScoreLabel } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
  showLabel?: boolean;
}

export function ScoreBadge({ score, showLabel = true }: ScoreBadgeProps) {
  return (
    <Badge variant="outline" className={`font-mono font-semibold ${getScoreBgColor(score)}`}>
      {score}/100{showLabel && ` — ${getScoreLabel(score)}`}
    </Badge>
  );
}
