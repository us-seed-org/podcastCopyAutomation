"use client";

import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { TitleCard } from "@/components/title-card";
import { RefreshCw, Youtube, Headphones } from "lucide-react";
import type { GenerationOutput } from "@/types/generation";

interface ResultsDashboardProps {
    data: GenerationOutput;
    onRegenerate: () => void;
    isRegenerating: boolean;
}

export function ResultsDashboard({ data, onRegenerate, isRegenerating }: ResultsDashboardProps) {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Generated Copy</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Review titles and thumbnail text below
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={onRegenerate}
                    disabled={isRegenerating}
                    className="gap-2"
                >
                    <RefreshCw className={`h-4 w-4 ${isRegenerating ? "animate-spin" : ""}`} />
                    Regenerate
                </Button>
            </div>

            <div className="space-y-8">
                <div>
                    <div className="flex items-center gap-2 mb-4">
                        <Youtube className="h-5 w-5 text-red-500" />
                        <h3 className="text-lg font-semibold">YouTube Titles + Thumbnail Text</h3>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        {data.youtubeTitles.map((title, i) => (
                            <TitleCard key={i} title={title} platform="youtube" index={i} />
                        ))}
                    </div>
                </div>

                <Separator className="bg-border/50" />

                <div>
                    <div className="flex items-center gap-2 mb-4">
                        <Headphones className="h-5 w-5 text-emerald-500" />
                        <h3 className="text-lg font-semibold">Spotify Titles</h3>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        {data.spotifyTitles.map((title, i) => (
                            <TitleCard key={i} title={title} platform="spotify" index={i} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
