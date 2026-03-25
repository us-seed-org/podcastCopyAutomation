"use client";

import { useState } from "react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TitleCard } from "@/components/title-card";
import { ScoreComparison } from "@/components/score-comparison";
import { CopyButton } from "@/components/copy-button";
import { ScoreBadge } from "@/components/score-badge";
import {
  RefreshCw,
  Youtube,
  Headphones,
  FileText,
  ListOrdered,
  Copy,
  Check,
  X,
  Image as ImageIcon
} from "lucide-react";
import type {
  GenerationMode,
  GenerationOutput,
  RerunMode,
  TitleArchetype,
} from "@/types/generation";
import { ThumbnailGenerator } from "@/components/thumbnail-generator";
import { ChatPanel } from "@/components/chat-panel";

interface ResultsDashboardProps {
  data: GenerationOutput;
  onRegenerate: () => void;
  onRegenerateTitle?: (archetype: TitleArchetype) => void;
  onRerunPass?: (mode: RerunMode) => void;
  onCancel?: () => void;
  isRegenerating: boolean;
  activeMode?: GenerationMode | null;
  regeneratingArchetype?: TitleArchetype | null;
  rerunningMode?: RerunMode | null;
  guestName?: string;
  runId?: string | null;
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

export function ResultsDashboard({
  data,
  onRegenerate,
  onRegenerateTitle,
  onRerunPass,
  onCancel,
  isRegenerating,
  activeMode,
  regeneratingArchetype,
  rerunningMode,
  guestName,
  runId,
}: ResultsDashboardProps) {
  const isActionRunning = isRegenerating;
  const effectiveMode = activeMode ?? rerunningMode ?? null;
  const hasDescriptions = Boolean(data.youtubeDescription || data.spotifyDescription);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Generated Copy</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Review titles, descriptions, and chapters below
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={onRegenerate}
            disabled={isActionRunning}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${effectiveMode === "full" ? "animate-spin" : ""}`} />
            {effectiveMode === "full" ? "Regenerating..." : "Full Regenerate"}
          </Button>
          <Button
            variant="outline"
            onClick={() => onRerunPass?.("rescore")}
            disabled={isActionRunning}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${effectiveMode === "rescore" ? "animate-spin" : ""}`} />
            Re-score
          </Button>
          <Button
            variant="outline"
            onClick={() => onRerunPass?.("rerank")}
            disabled={isActionRunning}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${effectiveMode === "rerank" ? "animate-spin" : ""}`} />
            Re-rank
          </Button>
          <Button
            variant="outline"
            onClick={() => onRerunPass?.("recontent")}
            disabled={isActionRunning}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${effectiveMode === "recontent" ? "animate-spin" : ""}`} />
            Re-content
          </Button>
          {isActionRunning && onCancel && (
            <Button variant="ghost" onClick={onCancel} className="gap-2">
              <X className="h-4 w-4" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="youtube" className="w-full">
        <ScrollArea className="w-full max-w-full pb-3 -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="w-full sm:w-auto inline-flex justify-start">
            <TabsTrigger value="youtube" className="gap-2">
              <Youtube className="w-4 h-4 text-red-500" />
              <span className="hidden sm:inline">YouTube</span>
              <span className="sm:hidden">YT</span>
              <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 min-w-5 h-5">{data.youtubeTitles.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="spotify" className="gap-2">
              <Headphones className="w-4 h-4 text-emerald-500" />
              Spotify
              <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 min-w-5 h-5">{data.spotifyTitles.length}</Badge>
            </TabsTrigger>
            {hasDescriptions && (
              <TabsTrigger value="descriptions" className="gap-2">
                <FileText className="w-4 h-4 text-blue-500" />
                Descriptions
              </TabsTrigger>
            )}
            {data.chapters && data.chapters.length > 0 && (
              <TabsTrigger value="chapters" className="gap-2">
                <ListOrdered className="w-4 h-4 text-amber-500" />
                Chapters
                <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 min-w-5 h-5">{data.chapters.length}</Badge>
              </TabsTrigger>
            )}
            <TabsTrigger value="thumbnails" className="gap-2">
              <ImageIcon className="w-4 h-4 text-purple-500" />
              Thumbnails
            </TabsTrigger>
          </TabsList>
        </ScrollArea>

        <TabsContent value="youtube" className="mt-4 space-y-8 outline-none focus-visible:ring-0">
          <div className="grid gap-4 md:grid-cols-2">
            {data.youtubeTitles.map((title, i) => (
              <TitleCard
                key={i}
                title={title}
                platform="youtube"
                index={i}
                isWinner={i === 0}
                onRegenerateTarget={onRegenerateTitle}
                isRegeneratingTarget={regeneratingArchetype === title.archetype}
                disableRegenerate={isActionRunning && regeneratingArchetype !== title.archetype}
              />
            ))}
          </div>
          {data.youtubeTitles.length >= 2 && (
            <div className="mt-4">
              <ScoreComparison titles={data.youtubeTitles} platform="youtube" />
            </div>
          )}
        </TabsContent>

        <TabsContent value="spotify" className="mt-4 space-y-8 outline-none focus-visible:ring-0">
          <div className="grid gap-4 md:grid-cols-2">
            {data.spotifyTitles.map((title, i) => (
              <TitleCard 
                key={i} 
                title={title} 
                platform="spotify" 
                index={i} 
                isWinner={i === 0} 
              />
            ))}
          </div>
        </TabsContent>

        {hasDescriptions && (
          <TabsContent value="descriptions" className="mt-4 space-y-8 outline-none focus-visible:ring-0">
            {data.youtubeDescription && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-red-500" />
                    <h3 className="text-lg font-semibold">YouTube Description</h3>
                    {data.descriptionScore && <ScoreBadge score={data.descriptionScore.total} />}
                  </div>
                  <CopyAllButton text={data.youtubeDescription} label="Copy All" />
                </div>
                <Card className="border-border/50 bg-card/50">
                  <CardContent className="p-5">
                    <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed text-foreground/90">
                      {data.youtubeDescription}
                    </pre>
                  </CardContent>
                </Card>
              </div>
            )}

            {data.spotifyDescription && (
              <div>
                {data.youtubeDescription && <Separator className="bg-border/50 mb-8" />}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-emerald-500" />
                    <h3 className="text-lg font-semibold">Spotify Description</h3>
                  </div>
                  <CopyAllButton text={data.spotifyDescription} label="Copy All" />
                </div>
                <Card className="border-border/50 bg-card/50">
                  <CardContent className="p-5">
                    <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed text-foreground/90">
                      {data.spotifyDescription}
                    </pre>
                  </CardContent>
                </Card>
              </div>
            )}

            {data.descriptionSEOKeywords && data.descriptionSEOKeywords.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-4">
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
          </TabsContent>
        )}

        {data.chapters && data.chapters.length > 0 && (
          <TabsContent value="chapters" className="mt-4 outline-none focus-visible:ring-0">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ListOrdered className="h-5 w-5 text-amber-500" />
                  <h3 className="text-lg font-semibold">Chapters</h3>
                  {data.chapterScore && <ScoreBadge score={data.chapterScore.total} />}
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
          </TabsContent>
        )}

        <TabsContent value="thumbnails" className="mt-4 outline-none focus-visible:ring-0">
          <ThumbnailGenerator data={data} guestName={guestName} />
        </TabsContent>
      </Tabs>

      {runId && (
        <ChatPanel
          runId={runId}
          generation={data}
          onActionTriggered={onRegenerate}
        />
      )}
    </div>
  );
}
