"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { TitleCard } from "@/components/title-card";
import { CopyButton } from "@/components/copy-button";
import { RefreshCw, Youtube, Headphones, AlignLeft, List } from "lucide-react";
import type { GenerationOutput } from "@/types/generation";

interface ResultsDashboardProps {
    data: GenerationOutput;
    onRegenerate: () => void;
    isRegenerating: boolean;
}

export function ResultsDashboard({ data, onRegenerate, isRegenerating }: ResultsDashboardProps) {
    const chaptersText = (data.chapters ?? [])
        .map((ch) => `${ch.timestamp} ${ch.title}`)
        .join("\n");

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

            <Tabs defaultValue="titles" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-muted/50">
                    <TabsTrigger value="titles" className="gap-2 data-[state=active]:bg-background">
                        <Headphones className="h-3.5 w-3.5" />
                        Titles
                    </TabsTrigger>
                    <TabsTrigger value="descriptions" className="gap-2 data-[state=active]:bg-background">
                        <AlignLeft className="h-3.5 w-3.5" />
                        Descriptions
                    </TabsTrigger>
                    <TabsTrigger value="chapters" className="gap-2 data-[state=active]:bg-background">
                        <List className="h-3.5 w-3.5" />
                        Chapters
                    </TabsTrigger>
                </TabsList>

                {/* Titles Tab */}
                <TabsContent value="titles" className="mt-6 space-y-8">
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <Youtube className="h-5 w-5 text-red-500" />
                            <h3 className="text-lg font-semibold">YouTube Titles</h3>
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
                </TabsContent>

                {/* Descriptions Tab */}
                <TabsContent value="descriptions" className="mt-6 space-y-6">
                    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Youtube className="h-5 w-5 text-red-500" />
                                    <CardTitle className="text-base">YouTube Description</CardTitle>
                                </div>
                                <CopyButton text={data.youtubeDescription || ""} label="Copy" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="whitespace-pre-wrap text-sm text-foreground/90 leading-relaxed font-mono bg-muted/30 rounded-lg p-4 max-h-[500px] overflow-y-auto">
                                {data.youtubeDescription || "Generating description..."}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Headphones className="h-5 w-5 text-emerald-500" />
                                    <CardTitle className="text-base">Spotify Description</CardTitle>
                                </div>
                                <CopyButton text={data.spotifyDescription || ""} label="Copy" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="whitespace-pre-wrap text-sm text-foreground/90 leading-relaxed font-mono bg-muted/30 rounded-lg p-4 max-h-[500px] overflow-y-auto">
                                {data.spotifyDescription || "Generating description..."}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Chapters Tab */}
                <TabsContent value="chapters" className="mt-6">
                    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base">Chapter Timestamps</CardTitle>
                                <CopyButton text={chaptersText} label="Copy All" />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Paste these into your YouTube description for auto-generated chapters
                            </p>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-1">
                                {(data.chapters ?? []).map((chapter, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center gap-4 py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors group"
                                    >
                                        <span className="font-mono text-sm text-primary min-w-[60px]">
                                            {chapter.timestamp}
                                        </span>
                                        <span className="text-sm flex-1">{chapter.title}</span>
                                        <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                                            <CopyButton
                                                text={`${chapter.timestamp} ${chapter.title}`}
                                                variant="ghost"
                                                size="icon"
                                                className="focus-visible:opacity-100"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
