"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, Search, Youtube, Wand2 } from "lucide-react";
import type { PipelineStep } from "@/types/pipeline";

interface PipelineStatusProps {
    step: PipelineStep;
    researchStatus: string;
    youtubeStatus: string;
    generationStatus: string;
    error: string | null;
}

type StepState = "idle" | "active" | "done" | "error" | "skipped";

function getStepState(
    targetStep: "research" | "youtube" | "generation",
    currentStep: PipelineStep,
    status: string
): StepState {
    const order: PipelineStep[] = ["idle", "research", "youtube", "generation", "complete", "error"];
    const targetIndex = order.indexOf(targetStep);
    const currentIndex = order.indexOf(currentStep);

    if (status.toLowerCase().includes("skipped")) return "skipped";
    if (status.toLowerCase().includes("failed")) return "error";
    if (status.toLowerCase().includes("complete")) return "done";

    if (currentStep === "complete") return "done";
    if (currentStep === "error") {
        if (currentIndex > targetIndex) return "done";
        return "error";
    }

    if (currentIndex > targetIndex) return "done";
    if (currentIndex === targetIndex) return "active";
    return "idle";
}

function StepIcon({ state }: { state: StepState }) {
    switch (state) {
        case "active":
            return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
        case "done":
            return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
        case "error":
            return <XCircle className="h-4 w-4 text-destructive" />;
        case "skipped":
            return <CheckCircle2 className="h-4 w-4 text-muted-foreground" />;
        default:
            return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />;
    }
}

const steps = [
    { key: "research" as const, label: "Research Agent", icon: Search, description: "Analyzing guest, brand & transcript" },
    { key: "youtube" as const, label: "YouTube Analysis", icon: Youtube, description: "Competitive channel analysis" },
    { key: "generation" as const, label: "Copy Generation", icon: Wand2, description: "Generating & scoring titles" },
];

export function PipelineStatus({ step, researchStatus, youtubeStatus, generationStatus, error }: PipelineStatusProps) {
    if (step === "idle") return null;

    const statusMessages: Record<string, string> = {
        research: researchStatus,
        youtube: youtubeStatus,
        generation: generationStatus,
    };

    return (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-primary/60 via-primary/30 to-transparent" />
            <CardContent className="p-5">
                <div className="flex items-center justify-between gap-4">
                    {steps.map((s, i) => {
                        const state = getStepState(s.key, step, statusMessages[s.key] || "");
                        const StatusIconComponent = s.icon;
                        return (
                            <div key={s.key} className="flex items-center gap-3 flex-1">
                                <div className="flex flex-col items-center gap-1">
                                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${state === "active"
                                            ? "border-primary bg-primary/10"
                                            : state === "done"
                                                ? "border-emerald-500/50 bg-emerald-500/10"
                                                : state === "error"
                                                    ? "border-destructive/50 bg-destructive/10"
                                                    : "border-muted-foreground/20 bg-muted/50"
                                        }`}>
                                        {state === "active" ? (
                                            <Loader2 className="h-[18px] w-[18px] animate-spin text-primary" />
                                        ) : state === "done" || state === "skipped" ? (
                                            <CheckCircle2 className="h-[18px] w-[18px] text-emerald-500" />
                                        ) : state === "error" ? (
                                            <XCircle className="h-[18px] w-[18px] text-destructive" />
                                        ) : (
                                            <StatusIconComponent className="h-[18px] w-[18px] text-muted-foreground/50" />
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-sm font-medium ${state === "active" ? "text-foreground" : state === "done" ? "text-emerald-500" : "text-muted-foreground"
                                            }`}>
                                            {s.label}
                                        </span>
                                        <StepIcon state={state} />
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                                        {statusMessages[s.key] || s.description}
                                    </p>
                                </div>
                                {i < steps.length - 1 && (
                                    <div className={`hidden sm:block w-8 h-px ${state === "done" ? "bg-emerald-500/40" : "bg-muted-foreground/20"
                                        }`} />
                                )}
                            </div>
                        );
                    })}
                </div>

                {error && (
                    <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                        <p className="text-sm text-destructive">{error}</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
