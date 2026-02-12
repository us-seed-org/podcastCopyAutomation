"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TranscriptUpload } from "@/components/transcript-upload";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import type { ParsedTranscript } from "@/lib/transcript-parser";
import type { FormInput } from "@/types/pipeline";
import { truncateTranscript } from "@/lib/transcript-parser";

interface InputFormProps {
  onSubmit: (data: FormInput) => void;
  isLoading: boolean;
}

export function InputForm({ onSubmit, isLoading }: InputFormProps) {
  const [guestName, setGuestName] = useState("");
  const [podcastName, setPodcastName] = useState("");
  const [episodeDescription, setEpisodeDescription] = useState("");
  const [coHosts, setCoHosts] = useState("");
  const [youtubeChannelUrl, setYoutubeChannelUrl] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [transcript, setTranscript] = useState<ParsedTranscript | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!transcript) newErrors.transcript = "Transcript is required";
    if (!guestName.trim()) newErrors.guestName = "Guest name is required";
    if (!podcastName.trim()) newErrors.podcastName = "Podcast name is required";
    if (!episodeDescription.trim() || episodeDescription.trim().length < 10)
      newErrors.episodeDescription = "Please provide at least a brief description (10+ characters)";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate() || !transcript) return;

    onSubmit({
      transcript: truncateTranscript(transcript.text),
      transcriptTimestamps: transcript.hasTimestamps,
      guestName: guestName.trim(),
      podcastName: podcastName.trim(),
      episodeDescription: episodeDescription.trim(),
      coHosts: coHosts.trim() || undefined,
      youtubeChannelUrl: youtubeChannelUrl.trim() || undefined,
      targetAudience: targetAudience.trim() || undefined,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Episode Details</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="transcript">Transcript *</Label>
            <TranscriptUpload
              onTranscriptParsed={(result) => {
                setTranscript(result);
                setFileName(result.text.length > 0 ? "transcript" : null);
                setErrors((prev) => ({ ...prev, transcript: "" }));
              }}
              currentFile={fileName}
              onClear={() => {
                setTranscript(null);
                setFileName(null);
              }}
            />
            {errors.transcript && <p className="text-sm text-destructive">{errors.transcript}</p>}
            {transcript && (
              <p className="text-xs text-muted-foreground">
                {transcript.text.length.toLocaleString()} characters
                {transcript.hasTimestamps && " | Timestamps detected"}
                {transcript.segments.length > 0 && ` | ${transcript.segments.length} segments`}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="guestName">Guest Name *</Label>
              <Input
                id="guestName"
                placeholder="e.g., Andrew Huberman"
                value={guestName}
                onChange={(e) => {
                  setGuestName(e.target.value);
                  setErrors((prev) => ({ ...prev, guestName: "" }));
                }}
              />
              {errors.guestName && <p className="text-sm text-destructive">{errors.guestName}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="podcastName">Podcast Name *</Label>
              <Input
                id="podcastName"
                placeholder="e.g., The Diary of a CEO"
                value={podcastName}
                onChange={(e) => {
                  setPodcastName(e.target.value);
                  setErrors((prev) => ({ ...prev, podcastName: "" }));
                }}
              />
              {errors.podcastName && <p className="text-sm text-destructive">{errors.podcastName}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="episodeDescription">Episode Description *</Label>
            <Textarea
              id="episodeDescription"
              placeholder="2-3 sentences about what this episode covers..."
              value={episodeDescription}
              onChange={(e) => {
                setEpisodeDescription(e.target.value);
                setErrors((prev) => ({ ...prev, episodeDescription: "" }));
              }}
              rows={3}
            />
            {errors.episodeDescription && (
              <p className="text-sm text-destructive">{errors.episodeDescription}</p>
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Advanced Options
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4 rounded-lg border p-4">
                <div className="space-y-2">
                  <Label htmlFor="coHosts">Co-Host Names</Label>
                  <Input
                    id="coHosts"
                    placeholder="Comma-separated, e.g., Joe Rogan, Jamie Vernon"
                    value={coHosts}
                    onChange={(e) => setCoHosts(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="youtubeChannelUrl">YouTube Channel URL</Label>
                  <Input
                    id="youtubeChannelUrl"
                    placeholder="e.g., https://youtube.com/@DiaryOfACEO"
                    value={youtubeChannelUrl}
                    onChange={(e) => setYoutubeChannelUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enables competitive title analysis from your channel
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="targetAudience">Target Audience</Label>
                  <Input
                    id="targetAudience"
                    placeholder="e.g., 25-45 year old men interested in health"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Copy...
              </>
            ) : (
              "Generate Copy"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
