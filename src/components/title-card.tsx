"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScoreBadge } from "@/components/score-badge";
import { ScoreBreakdownChart } from "@/components/score-breakdown";
import { CopyButton } from "@/components/copy-button";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import type { TitleOption } from "@/types/generation";

interface TitleCardProps {
  title: TitleOption;
  platform: "youtube" | "spotify";
  index: number;
}

const platformStyles = {
  youtube: {
    accent: "from-red-500/20 to-red-600/5",
    badge: "bg-red-500/10 text-red-400 border-red-500/20",
    label: "YouTube",
  },
  spotify: {
    accent: "from-emerald-500/20 to-emerald-600/5",
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    label: "Spotify",
  },
};

export function TitleCard({ title, platform, index }: TitleCardProps) {
  const [open, setOpen] = useState(false);
  const style = platformStyles[platform];
  const charCount = title.title.length;

  return (
    <Card className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm transition-all hover:border-border hover:shadow-lg hover:shadow-primary/5">
      <div className={`h-1 bg-gradient-to-r ${style.accent}`} />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${style.badge}`}>
              {style.label} #{index + 1}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {charCount} chars
            </span>
          </div>
          <ScoreBadge score={title.score.total} />
        </div>

        <p className="text-lg font-semibold leading-snug mb-4 text-foreground/95">
          {title.title}
        </p>

        {(title.scrollStopReason || title.emotionalTrigger) && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {title.scrollStopReason && (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/10">
                <Sparkles className="h-3 w-3" />
                {title.scrollStopReason}
              </span>
            )}
            {title.emotionalTrigger && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                {title.emotionalTrigger}
              </span>
            )}
          </div>
        )}

        {title.platformNotes && (
          <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
            {title.platformNotes}
          </p>
        )}

        <Collapsible open={open} onOpenChange={setOpen}>
          <div className="flex items-center justify-between">
            <CopyButton text={title.title} label="Copy Title" />

            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              Score Breakdown
              {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="mt-4">
            <ScoreBreakdownChart score={title.score} />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
