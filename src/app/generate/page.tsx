"use client";

import { InputForm } from "@/components/input-form";
import { PipelineStatus } from "@/components/pipeline-status";
import { PipelineTrace } from "@/components/pipeline-trace";
import { PipelineSummary } from "@/components/pipeline-summary";
import { ResultsDashboard } from "@/components/results-dashboard";
import { useGenerationPipeline } from "@/hooks/use-generation-pipeline";
import { Button } from "@/components/ui/button";
import { RotateCcw, Mic2, Sparkles } from "lucide-react";

export default function GeneratePage() {
    const { state, start, regenerate, reset, isRunning, isRegenerating } = useGenerationPipeline();

    return (
        <div className="min-h-screen bg-background relative">
            {/* Gradient background decoration */}
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute -top-[40%] -left-[20%] w-[60%] h-[60%] rounded-full bg-primary/[0.03] blur-3xl" />
                <div className="absolute -bottom-[30%] -right-[20%] w-[50%] h-[50%] rounded-full bg-primary/[0.02] blur-3xl" />
            </div>

            <div className="relative z-10 mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
                {/* Header */}
                <header className="mb-10 text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 mb-4">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-medium text-primary">AI-Powered Copy Generation</span>
                    </div>
                    <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                        <span className="inline-flex items-center gap-3">
                            <Mic2 className="h-9 w-9 sm:h-11 sm:w-11 text-primary" />
                            Podcast Copy Generator
                        </span>
                    </h1>
                    <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
                        Upload your transcript and let AI research your guest, analyze top-performing titles,
                        and generate scored copy optimized for YouTube &amp; Spotify.
                    </p>
                </header>

                {/* Main Content */}
                <div className="space-y-8">
                    {/* Input Form — hide when results are showing */}
                    {state.step === "idle" && (
                        <InputForm onSubmit={start} isLoading={isRunning} />
                    )}

                    {/* Pipeline Status */}
                    {state.step !== "idle" && state.step !== "complete" && state.step !== "error" && (
                        <PipelineStatus
                            step={state.step}
                            researchStatus={state.researchStatus}
                            youtubeStatus={state.youtubeStatus}
                            generationStatus={state.generationStatus}
                            error={state.error}
                            hasResearchData={!!state.research}
                            hasYouTubeData={!!state.youtube}
                            hasGenerationData={!!state.generation}
                        />
                    )}

                    {/* Pipeline Trace — visible during generation and collapsed after completion */}
                    {state.traceEntries?.length > 0 && (
                        <PipelineTrace
                            entries={state.traceEntries}
                            isRunning={isRunning || isRegenerating}
                        />
                    )}

                    {/* Error State */}
                    {state.step === "error" && (
                        <div className="text-center py-8">
                            <p className="text-destructive mb-4">{state.error}</p>
                            <Button variant="outline" onClick={reset} className="gap-2">
                                <RotateCcw className="h-4 w-4" />
                                Start Over
                            </Button>
                        </div>
                    )}

                    {/* Results */}
                    {state.step === "complete" && state.generation && (
                        <>
                            {/* Pipeline Summary — stats, weak dims, model breakdown */}
                            {state.pipelineSummary && (
                                <PipelineSummary summary={state.pipelineSummary} />
                            )}

                            <ResultsDashboard
                                data={state.generation}
                                onRegenerate={regenerate}
                                isRegenerating={isRegenerating}
                                guestName={state.research?.guest?.name}
                            />

                            <div className="text-center pt-4 pb-8">
                                <Button variant="ghost" onClick={reset} className="gap-2 text-muted-foreground">
                                    <RotateCcw className="h-4 w-4" />
                                    New Episode
                                </Button>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <footer className="mt-16 pb-8 text-center">
                    <p className="text-xs text-muted-foreground/50">
                        Powered by OpenAI Responses API • Scoring rubric based on DOAC, Huberman &amp; top podcast title strategies
                    </p>
                </footer>
            </div>
        </div>
    );
}
