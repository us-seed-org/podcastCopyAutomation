import type {
    PipelineEventType,
    PipelineTraceEntry,
    PipelineSummary,
    ModelBreakdown,
    PassDuration,
} from "@/types/pipeline-trace";

// ANSI color codes for console output
const COLORS = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    bgGreen: "\x1b[42m",
    bgRed: "\x1b[41m",
    bgYellow: "\x1b[43m",
    bgBlue: "\x1b[44m",
    bgMagenta: "\x1b[45m",
    bgCyan: "\x1b[46m",
};

const EVENT_STYLES: Record<PipelineEventType, { color: string; badge: string }> = {
    title_generated: { color: COLORS.blue, badge: "GENERATED" },
    title_scored: { color: COLORS.green, badge: "SCORED" },
    title_rejected: { color: COLORS.red, badge: "REJECTED" },
    title_rewritten: { color: COLORS.yellow, badge: "REWRITTEN" },
    title_selected: { color: COLORS.green, badge: "SELECTED" },
    guardrail_violation: { color: COLORS.red, badge: "GUARDRAIL" },
    dedup_removed: { color: COLORS.magenta, badge: "DEDUP" },
    thumbnail_refined: { color: COLORS.cyan, badge: "THUMBNAIL" },
    pairwise_result: { color: COLORS.magenta, badge: "PAIRWISE" },
    pass_summary: { color: COLORS.white, badge: "SUMMARY" },
    pipeline_warning: { color: COLORS.yellow, badge: "WARNING" },
};

export class PipelineLogger {
    private entries: PipelineTraceEntry[] = [];
    private passStartTimes: Map<string, number> = new Map();
    private passDurations: PassDuration[] = [];
    private pipelineStartTime: number;
    private onTrace?: (entry: PipelineTraceEntry) => void;

    constructor(onTrace?: (entry: PipelineTraceEntry) => void) {
        this.pipelineStartTime = Date.now();
        this.onTrace = onTrace;
    }

    log(entry: Omit<PipelineTraceEntry, "timestamp">): PipelineTraceEntry {
        const fullEntry: PipelineTraceEntry = {
            ...entry,
            timestamp: Date.now(),
        };
        this.entries.push(fullEntry);
        this.consoleLog(fullEntry);
        if (this.onTrace) this.onTrace(fullEntry);
        return fullEntry;
    }

    startPass(pass: string): void {
        this.passStartTimes.set(pass, Date.now());
        console.log(
            `${COLORS.bold}${COLORS.blue}┌─── PASS ${pass} ───────────────────────────────────────${COLORS.reset}`
        );
    }

    endPass(pass: string): void {
        const startTime = this.passStartTimes.get(pass);
        if (startTime) {
            const durationMs = Date.now() - startTime;
            this.passDurations.push({ pass, durationMs });
            console.log(
                `${COLORS.bold}${COLORS.blue}└─── PASS ${pass} complete (${(durationMs / 1000).toFixed(1)}s) ──────────────────────${COLORS.reset}`
            );
        }
    }

    getEntries(): PipelineTraceEntry[] {
        return [...this.entries];
    }

    buildSummary(): PipelineSummary {
        const generated = this.entries.filter((e) => e.event === "title_generated");
        const selected = this.entries.filter((e) => e.event === "title_selected");
        const rejected = this.entries.filter((e) => e.event === "title_rejected");
        const rewritten = this.entries.filter((e) => e.event === "title_rewritten");
        const scored = this.entries.filter((e) => e.event === "title_scored");

        const totalGenerated = generated.length;
        const totalSelected = selected.length;
        const totalRejected = rejected.length;
        const rewriteRate =
            totalGenerated > 0 ? (rewritten.length / totalGenerated) * 100 : 0;

        // Compute weak dimensions sorted by avg score
        const dimensionScores: Record<string, number[]> = {};
        for (const entry of scored) {
            if (entry.scoreDimensions) {
                for (const [dim, score] of Object.entries(entry.scoreDimensions)) {
                    if (dim === "total") continue;
                    if (!dimensionScores[dim]) dimensionScores[dim] = [];
                    dimensionScores[dim].push(score);
                }
            }
        }

        const weakDimensions = Object.entries(dimensionScores)
            .map(([dimension, scores]) => ({
                dimension,
                avgScore: scores.length > 0
                    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
                    : 0,
                maxScore: scores.length > 0 ? Math.max(...scores) : 0,
            }))
            .sort((a, b) => a.avgScore - b.avgScore);

        // Model breakdown
        const modelMap = new Map<
            string,
            { generated: number; selected: number; totalScore: number }
        >();
        for (const entry of generated) {
            const model = entry.model || "unknown";
            if (!modelMap.has(model)) {
                modelMap.set(model, { generated: 0, selected: 0, totalScore: 0 });
            }
            modelMap.get(model)!.generated++;
        }
        for (const entry of selected) {
            const model = entry.model || "unknown";
            if (!modelMap.has(model)) {
                modelMap.set(model, { generated: 0, selected: 0, totalScore: 0 });
            }
            const stats = modelMap.get(model)!;
            stats.selected++;
            stats.totalScore += entry.scoreTotal || 0;
        }

        const modelBreakdown: ModelBreakdown[] = Array.from(modelMap.entries()).map(
            ([model, stats]) => ({
                model,
                generated: stats.generated,
                selected: stats.selected,
                avgScore:
                    stats.selected > 0
                        ? Math.round((stats.totalScore / stats.selected) * 10) / 10
                        : 0,
            })
        );

        return {
            totalGenerated,
            totalSelected,
            totalRejected,
            rewriteRate: Math.round(rewriteRate * 10) / 10,
            weakDimensions,
            modelBreakdown,
            passDurations: [...this.passDurations],
            totalDurationMs: Date.now() - this.pipelineStartTime,
        };
    }

    private consoleLog(entry: PipelineTraceEntry): void {
        const style = EVENT_STYLES[entry.event];
        const passLabel = `[Pass ${entry.pass}]`;
        const badge = `[${style.badge}]`;
        const titleSnippet = entry.title
            ? ` "${entry.title.length > 50 ? entry.title.slice(0, 50) + "…" : entry.title}"`
            : "";
        const scoreLabel =
            entry.scoreTotal !== undefined ? ` ${entry.scoreTotal}/100` : "";
        const modelLabel = entry.model ? ` (${entry.model})` : "";
        const reasonLabel = entry.reason ? ` — ${entry.reason}` : "";

        console.log(
            `${style.color}${COLORS.bold}│ ${passLabel} ${badge}${COLORS.reset}${style.color}${titleSnippet}${scoreLabel}${modelLabel}${reasonLabel}${COLORS.reset}`
        );

        // Log dimension breakdown for scored titles
        if (entry.event === "title_scored" && entry.scoreDimensions) {
            const dims = Object.entries(entry.scoreDimensions)
                .filter(([k]) => k !== "total")
                .map(([k, v]) => `${k}:${v}`)
                .join(" ");
            console.log(
                `${COLORS.dim}│   └─ ${dims}${COLORS.reset}`
            );
        }

        // Log thumbnail info for refined entries
        if (entry.event === "thumbnail_refined" && entry.thumbnailText) {
            console.log(
                `${COLORS.dim}│   └─ thumbnail: "${entry.thumbnailText}" (${entry.thumbnailScoreTotal || "?"}/100)${COLORS.reset}`
            );
        }
    }
}
