"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScoreBadge } from "@/components/score-badge";
import { ScoreBreakdownChart } from "@/components/score-breakdown";
import { ThumbnailTextScoreChart } from "@/components/thumbnail-text-score";
import { CopyButton } from "@/components/copy-button";
import { HumanFeedback } from "@/components/human-feedback";
import { ChevronDown, ChevronUp, Sparkles, Image as ImageIcon } from "lucide-react";
import type { TitleOption, TitleArchetype, ThumbnailArchetype } from "@/types/generation";

const archetypeLabels: Record<TitleArchetype, string> = {
  authority_shocking: "Authority + Shocking",
  mechanism_outcome: "Mechanism + Outcome",
  curiosity_gap: "Curiosity Gap",
  negative_contrarian: "Negative Contrarian",
};

const thumbArchetypeLabels: Record<ThumbnailArchetype, string> = {
  gut_punch: "Gut Punch",
  label: "Label",
  alarm: "Alarm",
  confrontation: "Confrontation",
};

const thumbArchetypeColors: Record<ThumbnailArchetype, string> = {
  gut_punch: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  label: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  alarm: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  confrontation: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};

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
            {platform === "youtube" && title.pairwiseRank !== undefined && title.pairwiseWins !== undefined && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/20">
                #{title.pairwiseRank}({title.pairwiseWins}W)
              </span>
            )}
          </div>
          <ScoreBadge score={title.score.total} />
        </div>

        {/* Archetype Badges */}
        {(title.archetype || title.thumbnailArchetype) && (
          <div className="flex items-center gap-1.5 mb-3">
            {title.archetype && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {archetypeLabels[title.archetype]}
              </span>
            )}
            {title.thumbnailArchetype && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${thumbArchetypeColors[title.thumbnailArchetype]}`}>
                {thumbArchetypeLabels[title.thumbnailArchetype]}
              </span>
            )}
          </div>
        )}

        {/* Thumbnail Text — YouTube only */}
        {platform === "youtube" && title.thumbnailText && (
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Thumbnail Text
              </span>
              {title.thumbnailTextScore && (
                <ScoreBadge score={title.thumbnailTextScore.total} showLabel={false} />
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-red-500/80 text-white font-black text-xl tracking-wide px-4 py-2.5 rounded-lg shadow-sm uppercase leading-tight">
                {title.thumbnailText}
              </div>
              <CopyButton text={title.thumbnailText} label="Copy" />
            </div>
          </div>
        )}

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
          <CollapsibleContent className="mt-4 space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Title Score</p>
              <ScoreBreakdownChart score={title.score} />
            </div>
            {platform === "youtube" && title.thumbnailTextScore && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Thumbnail Text Score</p>
                <ThumbnailTextScoreChart score={title.thumbnailTextScore} />
              </div>
            )}
            <HumanFeedback titleResultId={title.titleResultId} />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
