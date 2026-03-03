"use client";

import { useState } from "react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TitleCard } from "@/components/title-card";
import { ScoreComparison } from "@/components/score-comparison";
import { CopyButton } from "@/components/copy-button";
import { ScoreBadge } from "@/components/score-badge";
import { RefreshCw, Youtube, Headphones, FileText, ListOrdered, Copy, Check } from "lucide-react";
import type { GenerationOutput } from "@/types/generation";

interface ResultsDashboardProps {
    data: GenerationOutput;
    onRegenerate: () => void;
    isRegenerating: boolean;
}

function CopyAllButton({ text, label }: { text: string; label: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(text);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                } catch (err) {
                    console.error("Failed to copy to clipboard:", err);
                }
            }}
        >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied!" : label}
        </Button>
    );
}

export function ResultsDashboard({ data, onRegenerate, isRegenerating }: ResultsDashboardProps) {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Generated Copy</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Review titles, descriptions, and chapters below
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
                {/* YouTube Titles */}
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
                    {data.youtubeTitles.length >= 2 && (
                        <div className="mt-4">
                            <ScoreComparison titles={data.youtubeTitles} platform="youtube" />
                        </div>
                    )}
                </div>

                <Separator className="bg-border/50" />

                {/* Spotify Titles */}
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

                {/* YouTube Description */}
                {data.youtubeDescription && (
                    <>
                        <Separator className="bg-border/50" />
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <FileText className="h-5 w-5 text-red-500" />
                                    <h3 className="text-lg font-semibold">YouTube Description</h3>
                                    {data.descriptionScore && (
                                        <ScoreBadge score={data.descriptionScore.total} />
                                    )}
                                </div>
                                <CopyAllButton text={data.youtubeDescription} label="Copy Description" />
                            </div>
                            <Card className="border-border/50 bg-card/50">
                                <CardContent className="p-5">
                                    <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed text-foreground/90">
                                        {data.youtubeDescription}
                                    </pre>
                                </CardContent>
                            </Card>
                        </div>
                    </>
                )}

                {/* Spotify Description */}
                {data.spotifyDescription && (
                    <>
                        <Separator className="bg-border/50" />
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <FileText className="h-5 w-5 text-emerald-500" />
                                    <h3 className="text-lg font-semibold">Spotify Description</h3>
                                </div>
                                <CopyAllButton text={data.spotifyDescription} label="Copy Description" />
                            </div>
                            <Card className="border-border/50 bg-card/50">
                                <CardContent className="p-5">
                                    <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed text-foreground/90">
                                        {data.spotifyDescription}
                                    </pre>
                                </CardContent>
                            </Card>
                        </div>
                    </>
                )}

                {/* Chapters */}
                {data.chapters && data.chapters.length > 0 && (
                    <>
                        <Separator className="bg-border/50" />
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <ListOrdered className="h-5 w-5 text-blue-500" />
                                    <h3 className="text-lg font-semibold">Chapters</h3>
                                    {data.chapterScore && (
                                        <ScoreBadge score={data.chapterScore.total} />
                                    )}
                                </div>
                                <CopyAllButton
                                    text={data.chapters.map((c) => `${c.timestamp} ${c.title}`).join("\n")}
                                    label="Copy All Chapters"
                                />
                            </div>
                            <Card className="border-border/50 bg-card/50">
                                <CardContent className="p-5">
                                    <div className="space-y-2">
                                        {data.chapters.map((chapter, i) => (
                                            <div key={i} className="flex items-start gap-3 group">
                                                <span className="text-sm font-mono text-muted-foreground shrink-0 pt-0.5 min-w-[60px]">
                                                    {chapter.timestamp}
                                                </span>
                                                <span className="text-sm font-medium text-foreground/90 flex-1">
                                                    {chapter.title}
                                                </span>
                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <CopyButton text={`${chapter.timestamp} ${chapter.title}`} label="" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </>
                )}

                {/* SEO Keywords */}
                {data.descriptionSEOKeywords && data.descriptionSEOKeywords.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mr-2 self-center">
                            SEO Keywords:
                        </span>
                        {data.descriptionSEOKeywords.map((kw, i) => (
                            <span
                                key={i}
                                className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground"
                            >
                                {kw}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
