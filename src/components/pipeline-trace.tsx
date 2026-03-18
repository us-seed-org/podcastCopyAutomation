"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent,
} from "@/components/ui/collapsible";
import {
    ChevronDown,
    Radio,
    Zap,
    Shield,
    Star,
    Trophy,
    ImageIcon,
    Swords,
    XCircle,
    AlertTriangle,
    Copy,
} from "lucide-react";
import type { PipelineTraceEntry, PipelineEventType } from "@/types/pipeline-trace";

const EVENT_CONFIG: Record<
    PipelineEventType,
    { label: string; color: string; bgColor: string; icon: typeof Zap }
> = {
    title_generated: {
        label: "GENERATED",
        color: "text-blue-400",
        bgColor: "bg-blue-500/15 border-blue-500/30",
        icon: Zap,
    },
    title_scored: {
        label: "SCORED",
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/15 border-emerald-500/30",
        icon: Star,
    },
    title_rejected: {
        label: "REJECTED",
        color: "text-red-400",
        bgColor: "bg-red-500/15 border-red-500/30",
        icon: XCircle,
    },
    title_rewritten: {
        label: "REWRITTEN",
        color: "text-amber-400",
        bgColor: "bg-amber-500/15 border-amber-500/30",
        icon: Copy,
    },
    title_selected: {
        label: "SELECTED",
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/15 border-emerald-500/30",
        icon: Trophy,
    },
    guardrail_violation: {
        label: "GUARDRAIL",
        color: "text-red-400",
        bgColor: "bg-red-500/15 border-red-500/30",
        icon: Shield,
    },
    dedup_removed: {
        label: "DEDUP",
        color: "text-purple-400",
        bgColor: "bg-purple-500/15 border-purple-500/30",
        icon: Copy,
    },
    thumbnail_refined: {
        label: "THUMBNAIL",
        color: "text-cyan-400",
        bgColor: "bg-cyan-500/15 border-cyan-500/30",
        icon: ImageIcon,
    },
    pairwise_result: {
        label: "PAIRWISE",
        color: "text-purple-400",
        bgColor: "bg-purple-500/15 border-purple-500/30",
        icon: Swords,
    },
    pass_summary: {
        label: "SUMMARY",
        color: "text-slate-400",
        bgColor: "bg-slate-500/15 border-slate-500/30",
        icon: Radio,
    },
    pipeline_warning: {
        label: "WARNING",
        color: "text-amber-400",
        bgColor: "bg-amber-500/15 border-amber-500/30",
        icon: AlertTriangle,
    },
};

interface PipelineTraceProps {
    entries: PipelineTraceEntry[];
    isRunning: boolean;
}

function TraceEntry({
    entry,
    isExpanded,
    onToggle,
}: {
    entry: PipelineTraceEntry;
    isExpanded: boolean;
    onToggle: () => void;
}) {
    const config = EVENT_CONFIG[entry.event];
    const Icon = config.icon;

    return (
        <button
            onClick={onToggle}
            className={`w-full text-left px-3 py-2 rounded-lg border transition-all hover:brightness-110 ${config.bgColor}`}
        >
            <div className="flex items-center gap-2 min-w-0">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${config.color}`} />
                <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 shrink-0 ${config.color} border-current/30`}
                >
                    {config.label}
                </Badge>
                <span className="text-[10px] text-muted-foreground shrink-0">
                    P{entry.pass}
                </span>
                {entry.title && (
                    <span className="text-xs text-foreground/80 truncate min-w-0">
                        {entry.title}
                    </span>
                )}
                <div className="ml-auto flex items-center gap-2 shrink-0">
                    {entry.scoreTotal !== undefined && (
                        <span
                            className={`text-xs font-mono font-semibold ${entry.scoreTotal >= 70
                                ? "text-emerald-400"
                                : entry.scoreTotal >= 50
                                    ? "text-amber-400"
                                    : "text-red-400"
                                }`}
                        >
                            {entry.scoreTotal}
                        </span>
                    )}
                    {entry.model && (
                        <span className="text-[10px] text-muted-foreground hidden sm:inline">
                            {entry.model}
                        </span>
                    )}
                </div>
            </div>

            {isExpanded && (
                <div className="mt-2 pt-2 border-t border-current/10 space-y-1.5">
                    {entry.reason && (
                        <p className="text-[11px] text-muted-foreground">
                            {entry.reason}
                        </p>
                    )}
                    {entry.scoreDimensions && (
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1">
                            {Object.entries(entry.scoreDimensions)
                                .filter(([k]) => k !== "total")
                                .map(([k, v]) => (
                                    <div
                                        key={k}
                                        className="flex items-center gap-1 text-[10px] text-muted-foreground"
                                    >
                                        <span className="truncate">{k}:</span>
                                        <span className="font-mono font-semibold text-foreground/70">
                                            {v}
                                        </span>
                                    </div>
                                ))}
                        </div>
                    )}
                    {entry.thumbnailText && (
                        <p className="text-[11px] text-cyan-400/80">
                            🖼 &quot;{entry.thumbnailText}&quot;
                            {entry.thumbnailScoreTotal !== undefined &&
                                ` (${entry.thumbnailScoreTotal}/100)`}
                        </p>
                    )}
                    {entry.pairwiseRank !== undefined && (
                        <p className="text-[11px] text-purple-400/80">
                            🏆 Rank #{entry.pairwiseRank}
                            {entry.pairwiseWins !== undefined &&
                                ` (${entry.pairwiseWins} wins)`}
                        </p>
                    )}
                </div>
            )}
        </button>
    );
}

export function PipelineTrace({ entries, isRunning }: PipelineTraceProps) {
    const [isOpen, setIsOpen] = useState(true);
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll as entries arrive
    useEffect(() => {
        if (scrollRef.current && isRunning) {
            const el = scrollRef.current;
            el.scrollTop = el.scrollHeight;
        }
    }, [entries.length, isRunning]);

    // Collapse after pipeline stops; open again when it resumes
    useEffect(() => {
        setIsOpen(isRunning);
    }, [isRunning]);

    if (!entries || entries.length === 0) return null;

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} data-testid="pipeline-trace-collapsible">
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
                <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-2">
                            {isRunning && (
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                                </span>
                            )}
                            <span className="text-sm font-medium text-foreground">
                                Pipeline Trace
                            </span>
                            <Badge variant="secondary" className="text-[10px]">
                                {entries.length}
                            </Badge>
                            {isRunning && (
                                <Badge
                                    variant="outline"
                                    className="text-[10px] text-emerald-400 border-emerald-500/30 animate-pulse"
                                >
                                    LIVE
                                </Badge>
                            )}
                        </div>
                        <ChevronDown
                            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""
                                }`}
                        />
                    </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <CardContent className="p-0 border-t border-border/50">
                        <div ref={scrollRef} className="p-3 space-y-1.5 max-h-[400px] overflow-y-auto">
                            {entries.map((entry, idx) => (
                                <TraceEntry
                                    key={entry.id || `${entry.timestamp}-${idx}`}
                                    entry={entry}
                                    isExpanded={expandedIdx === idx}
                                    onToggle={() =>
                                        setExpandedIdx(expandedIdx === idx ? null : idx)
                                    }
                                />
                            ))}
                        </div>
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}
