"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Zap,
    Trophy,
    RefreshCw,
    Clock,
    AlertTriangle,
} from "lucide-react";
import type { PipelineSummary as PipelineSummaryType } from "@/types/pipeline-trace";

const THRESHOLDS = {
    REWRITE_RATE: {
        GOOD: 20,
        WARNING: 50
    },
    SCORE_PERCENTAGE: {
        WARNING: 50,
        GOOD: 70
    },
    SCORE_NORMALIZED: {
        WARNING: 0.5,
        GOOD: 0.7
    }
};

interface PipelineSummaryProps {
    summary: PipelineSummaryType;
}

function StatBox({
    icon: Icon,
    label,
    value,
    color,
    subtext,
}: {
    icon: typeof Zap;
    label: string;
    value: string | number;
    color: string;
    subtext?: string;
}) {
    return (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
            <div className={`p-2 rounded-lg ${color}`}>
                <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-bold text-foreground tabular-nums">
                    {value}
                </p>
                {subtext && (
                    <p className="text-[10px] text-muted-foreground">{subtext}</p>
                )}
            </div>
        </div>
    );
}

function DimensionBar({
    dimension,
    avgScore,
    maxScore,
}: {
    dimension: string;
    avgScore: number;
    maxScore: number;
}) {
    const normalizedAvg = Math.min(avgScore / Math.max(maxScore, 1), 1);
    const barColor =
        normalizedAvg >= THRESHOLDS.SCORE_NORMALIZED.GOOD
            ? "bg-emerald-500"
            : normalizedAvg >= THRESHOLDS.SCORE_NORMALIZED.WARNING
                ? "bg-amber-500"
                : "bg-red-500";

    return (
        <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground w-28 truncate">
                {dimension}
            </span>
            <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${normalizedAvg * 100}%` }}
                />
            </div>
            <span className="text-[11px] font-mono text-foreground/70 w-12 text-right">
                {avgScore}/{maxScore}
            </span>
        </div>
    );
}

export function PipelineSummary({ summary }: PipelineSummaryProps) {
    const rewriteColor =
        summary.rewriteRate < THRESHOLDS.REWRITE_RATE.GOOD
            ? "bg-emerald-500/15 text-emerald-500"
            : summary.rewriteRate < THRESHOLDS.REWRITE_RATE.WARNING
                ? "bg-amber-500/15 text-amber-500"
                : "bg-red-500/15 text-red-500";

    const durationSec = (summary.totalDurationMs / 1000).toFixed(1);

    return (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-emerald-500/60 via-blue-500/30 to-transparent" />
            <CardContent className="p-5 space-y-5">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">
                        Pipeline Summary
                    </h3>
                    <Badge variant="secondary" className="text-[10px]">
                        {durationSec}s
                    </Badge>
                </div>

                {/* Stat Boxes */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatBox
                        icon={Zap}
                        label="Generated"
                        value={summary.totalGenerated}
                        color="bg-blue-500/15 text-blue-400"
                    />
                    <StatBox
                        icon={Trophy}
                        label="Selected"
                        value={summary.totalSelected}
                        color="bg-emerald-500/15 text-emerald-400"
                    />
                    <StatBox
                        icon={RefreshCw}
                        label="Rewrite Rate"
                        value={`${summary.rewriteRate}%`}
                        color={rewriteColor}
                    />
                    <StatBox
                        icon={Clock}
                        label="Duration"
                        value={`${durationSec}s`}
                        color="bg-slate-500/15 text-slate-400"
                        subtext={
                            summary.passDurations.length > 0
                                ? summary.passDurations
                                    .map(
                                        (p) =>
                                            `P${p.pass}: ${(p.durationMs / 1000).toFixed(1)}s`
                                    )
                                    .join(" · ")
                                : undefined
                        }
                    />
                </div>

                {/* Rewrite Warning */}
                {summary.rewriteRate > THRESHOLDS.REWRITE_RATE.WARNING && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                        <p className="text-xs text-amber-300/80">
                            High rewrite rate ({summary.rewriteRate}%) — consider
                            recalibrating the generation prompt.
                        </p>
                    </div>
                )}

                {/* Weak Dimensions */}
                {summary.weakDimensions.length > 0 && (
                    <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                            Dimension Scores (sorted weakest → strongest)
                        </p>
                        <div className="space-y-1.5">
                            {summary.weakDimensions.map((dim) => (
                                <DimensionBar
                                    key={dim.dimension}
                                    dimension={dim.dimension}
                                    avgScore={dim.avgScore}
                                    maxScore={dim.maxScore}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Model Breakdown */}
                {summary.modelBreakdown.length > 0 && (
                    <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                            Model Performance
                        </p>
                        <div className="rounded-lg border border-border/50 overflow-hidden">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="bg-muted/30 text-muted-foreground">
                                        <th className="text-left px-3 py-2 font-medium">Model</th>
                                        <th className="text-right px-3 py-2 font-medium">
                                            Generated
                                        </th>
                                        <th className="text-right px-3 py-2 font-medium">
                                            Selected
                                        </th>
                                        <th className="text-right px-3 py-2 font-medium">
                                            Avg Score
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/30">
                                    {summary.modelBreakdown.map((m) => (
                                        <tr
                                            key={m.model}
                                            className="hover:bg-muted/20 transition-colors"
                                        >
                                            <td className="px-3 py-2 text-foreground/80 font-medium truncate max-w-[200px]">
                                                {m.model}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums text-foreground/70">
                                                {m.generated}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums text-foreground/70">
                                                {m.selected}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                <span
                                                    className={
                                                        m.avgScore == null
                                                            ? "text-slate-400"
                                                            : m.avgScore >= THRESHOLDS.SCORE_PERCENTAGE.GOOD
                                                                ? "text-emerald-400"
                                                                : m.avgScore >= THRESHOLDS.SCORE_PERCENTAGE.WARNING
                                                                    ? "text-amber-400"
                                                                    : "text-red-400"
                                                    }
                                                >
                                                    {m.avgScore ?? "—"}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
