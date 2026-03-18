"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Image,
  Upload,
  Loader2,
  Download,
  RefreshCw,
  Search,
  Palette,
  Sparkles,
  X,
  User,
  UserPlus,
} from "lucide-react";
import { useThumbnailPipeline } from "@/hooks/use-thumbnail-pipeline";
import type { GenerationOutput } from "@/types/generation";

interface Guest {
  id: string;
  name: string;
  headshotBase64?: string;
  headshotName?: string;
}

interface ThumbnailGeneratorProps {
  data: GenerationOutput;
  guestName?: string;
}

const MAX_HEADSHOT_BYTES = 5 * 1024 * 1024; // 5 MB

export function ThumbnailGenerator({
  data,
  guestName: initialGuestName,
}: ThumbnailGeneratorProps) {
  const { state, analyzeChannel, generateThumbnails, reset } =
    useThumbnailPipeline();
  const [channelUrl, setChannelUrl] = useState("");
  const [selectedTitleIdx, setSelectedTitleIdx] = useState(0);
  const [guests, setGuests] = useState<Guest[]>([
    { id: crypto.randomUUID(), name: initialGuestName ?? "" },
  ]);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [progressMsg, setProgressMsg] = useState("");

  useEffect(() => {
    if (initialGuestName) {
      setGuests((prev) => {
        if (prev[0]?.name) return prev;
        return [{ ...prev[0], name: initialGuestName }, ...prev.slice(1)];
      });
    }
  }, [initialGuestName]);

  const guestCount = guests.filter((g) => g.name.trim()).length;

  useEffect(() => {
    const ANALYSIS_STEPS = [
      "Resolving channel…",
      "Fetching recent videos…",
      "Filtering out Shorts…",
      "Downloading thumbnails…",
      "Analyzing visual patterns with AI…",
    ];

    const GENERATION_STEPS = [
      guestCount > 1
        ? `Looking up headshots for ${guestCount} guests…`
        : "Looking up guest headshot…",
      "Removing backgrounds…",
      "Generating variant copy…",
      "Generating thumbnail 1 of 3…",
      "Generating thumbnail 2 of 3…",
      "Generating thumbnail 3 of 3…",
    ];

    if (state.stage === "analyzing") {
      let stepIndex = 0;
      setProgressMsg(ANALYSIS_STEPS[0]);
      const interval = setInterval(() => {
        stepIndex++;
        if (stepIndex < ANALYSIS_STEPS.length) {
          setProgressMsg(ANALYSIS_STEPS[stepIndex]);
        }
      }, 3000);
      return () => clearInterval(interval);
    } else if (state.stage === "generating") {
      let stepIndex = 0;
      setProgressMsg(GENERATION_STEPS[0]);
      const interval = setInterval(() => {
        stepIndex++;
        if (stepIndex < GENERATION_STEPS.length) {
          setProgressMsg(GENERATION_STEPS[stepIndex]);
        }
      }, 8000);
      return () => clearInterval(interval);
    } else {
      setProgressMsg("");
    }
  }, [state.stage, guestCount]);

  const allTitles = [...data.youtubeTitles, ...data.spotifyTitles];
  const selectedTitle = allTitles[selectedTitleIdx] ?? allTitles[0];

  const handleAnalyze = useCallback(() => {
    if (channelUrl.trim()) {
      analyzeChannel(channelUrl.trim());
    }
  }, [channelUrl, analyzeChannel]);

  // Guest management
  const addGuest = useCallback(() => {
    setGuests((prev) => [...prev, { id: crypto.randomUUID(), name: "" }]);
  }, []);

  const removeGuest = useCallback((id: string) => {
    setGuests((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const updateGuestName = useCallback((id: string, name: string) => {
    setGuests((prev) =>
      prev.map((g) => (g.id === id ? { ...g, name } : g))
    );
  }, []);


  const handleGuestFileChange = useCallback(
    (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > MAX_HEADSHOT_BYTES) {
        alert(`Headshot must be under 5 MB (selected: ${(file.size / 1024 / 1024).toFixed(1)} MB)`);
        e.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => {
        console.error("[ThumbnailGenerator] FileReader error:", reader.error);
        alert("Failed to read the selected file. Please try again.");
        e.target.value = "";
      };
      reader.onload = () => {
        setGuests((prev) =>
          prev.map((g) =>
            g.id === id
              ? {
                ...g,
                headshotBase64: reader.result as string,
                headshotName: file.name,
              }
              : g
          )
        );
      };
      reader.readAsDataURL(file);
    },
    []
  );

  const clearGuestHeadshot = useCallback((id: string) => {
    setGuests((prev) =>
      prev.map((g) =>
        g.id === id
          ? { ...g, headshotBase64: undefined, headshotName: undefined }
          : g
      )
    );
    const input = fileInputRefs.current[id];
    if (input) input.value = "";
  }, []);

  const handleGenerate = useCallback(() => {
    if (!selectedTitle) return;
    const activeGuests = guests
      .filter((g) => g.name.trim() || g.headshotBase64)
      .map((g) => ({ name: g.name.trim(), headshotBase64: g.headshotBase64 }));

    generateThumbnails({
      titleText: selectedTitle.title,
      guests: activeGuests.length > 0 ? activeGuests : undefined,
      existingThumbnailUrls: state.existingThumbnails,
      generateCount: 3,
    });
  }, [selectedTitle, guests, generateThumbnails, state.existingThumbnails]);

  const handleDownload = useCallback(
    async (dataUrl: string, index: number) => {
      if ("download" in document.createElement("a")) {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `thumbnail-variant-${index + 1}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        window.open(dataUrl, "_blank");
      }
    },
    []
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <span aria-hidden="true"><Image className="h-5 w-5 text-purple-500" /></span>
          <h3 className="text-lg font-semibold">Thumbnail Generator</h3>
        </div>
        {state.stage !== "idle" && (
          <Button variant="ghost" size="sm" onClick={reset}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Analyze your channel&apos;s thumbnail style, then generate matching
        thumbnails for this episode.
      </p>

      <Card className="border-border/50 bg-card/50">
        <CardContent className="p-5 space-y-6">
          {/* Step 1: Channel URL */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5" />
              Step 1: Channel URL
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="https://youtube.com/@YourChannel"
                value={channelUrl}
                onChange={(e) => setChannelUrl(e.target.value)}
                disabled={state.stage !== "idle" && state.stage !== "error"}
              />
              <Button
                onClick={handleAnalyze}
                disabled={
                  !channelUrl.trim() || state.stage === "analyzing"
                }
              >
                {state.stage === "analyzing" ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  "Analyze"
                )}
              </Button>
            </div>
            {state.stage === "analyzing" && progressMsg && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                {progressMsg}
              </div>
            )}
          </div>

          {/* Error */}
          {state.error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {state.error}
            </div>
          )}

          {/* Step 2: Existing thumbnails grid */}
          {state.existingThumbnails.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Palette className="h-3.5 w-3.5" />
                  Step 2: Channel Style — {state.channelName}
                </Label>
                <div className="grid grid-cols-5 gap-2">
                  {state.existingThumbnails.slice(0, 10).map((url, i) => (
                    <div
                      key={i}
                      className="rounded-md overflow-hidden border border-border"
                    >
                      <div style={{ aspectRatio: "16/9" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Thumbnail ${i + 1}`}
                          className="object-cover w-full h-full"
                          loading="lazy"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {state.channelStyle && (
                  <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
                    <div>
                      <span className="font-medium">Layout:</span>{" "}
                      <span className="text-muted-foreground">
                        {state.channelStyle.layout}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Text:</span>{" "}
                      <span className="text-muted-foreground">
                        {state.channelStyle.textStyle}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Photos:</span>{" "}
                      <span className="text-muted-foreground">
                        {state.channelStyle.photoTreatment}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Brand:</span>{" "}
                      <span className="text-muted-foreground">
                        {state.channelStyle.brandElements}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Vibe:</span>{" "}
                      <span className="text-muted-foreground">
                        {state.channelStyle.overallVibe}
                      </span>
                    </div>
                    <div className="flex gap-1.5 pt-1">
                      {state.channelStyle.colorPalette.map((color, i) => (
                        <div
                          key={i}
                          className="w-6 h-6 rounded-full border border-border"
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Step 3: Configure & Generate */}
          {(state.stage === "analyzed" ||
            state.stage === "generating" ||
            state.stage === "complete") && (
              <>
                <Separator />
                <div className="space-y-4">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    Step 3: Generate Thumbnails
                  </Label>

                  {/* Guests */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Guests (auto-finds headshots via Wikipedia)
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={addGuest}
                        disabled={state.stage === "generating"}
                      >
                        <UserPlus className="h-3 w-3 mr-1" />
                        Add Guest
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {guests.map((guest, idx) => (
                        <div
                          key={guest.id}
                          className="rounded-lg border border-border p-3 space-y-2"
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <Input
                                placeholder={`Guest ${idx + 1} name (e.g. Elon Musk)`}
                                value={guest.name}
                                onChange={(e) =>
                                  updateGuestName(guest.id, e.target.value)
                                }
                                disabled={state.stage === "generating"}
                                className="h-8 text-sm"
                              />
                            </div>
                            {guests.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() => removeGuest(guest.id)}
                                disabled={state.stage === "generating"}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>

                          <div className="pl-1">
                            <p className="text-[10px] text-muted-foreground mb-1.5">
                              Override headshot (optional — we&apos;ll auto-find
                              one)
                            </p>
                            <input
                              ref={(el) => {
                                fileInputRefs.current[guest.id] = el;
                              }}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                handleGuestFileChange(guest.id, e)
                              }
                            />
                            {guest.headshotBase64 ? (
                              <div className="flex items-center gap-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={guest.headshotBase64}
                                  alt="Headshot preview"
                                  className="w-10 h-10 rounded-full object-cover border border-border"
                                />
                                <span className="text-xs text-muted-foreground truncate flex-1">
                                  {guest.headshotName}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() =>
                                    clearGuestHeadshot(guest.id)
                                  }
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() =>
                                  fileInputRefs.current[guest.id]?.click()
                                }
                                disabled={state.stage === "generating"}
                              >
                                <Upload className="h-3 w-3 mr-1" />
                                Upload Headshot
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Title selector */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Select title for thumbnail
                    </Label>
                    <select
                      value={selectedTitleIdx}
                      onChange={(e) =>
                        setSelectedTitleIdx(Number(e.target.value))
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      {allTitles.map((t, i) => (
                        <option key={i} value={i}>
                          [{t.archetype ?? t.score?.total ? "youtube" : "spotify"}
                          ] {t.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Button
                    onClick={handleGenerate}
                    disabled={
                      state.stage === "generating" || !selectedTitle
                    }
                    className="w-full"
                  >
                    {state.stage === "generating" ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        Generating Thumbnails…
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-1.5" />
                        Generate 3 Thumbnail Variants
                      </>
                    )}
                  </Button>

                  {state.stage === "generating" && progressMsg && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      {progressMsg}
                    </div>
                  )}
                </div>
              </>
            )}

          {/* Step 4: Results */}
          {state.generatedThumbnails.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  Generated Thumbnails
                </Label>
                <div className="grid gap-4 md:grid-cols-3">
                  {state.generatedThumbnails.map((thumb, i) => (
                    <div key={i} className="space-y-2">
                      <div className="rounded-lg overflow-hidden border border-border">
                        <div style={{ aspectRatio: "16/9" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={thumb.imageUrl}
                            alt={`Variant ${i + 1}`}
                            className="object-cover w-full h-full"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-[10px]">
                          Variant {i + 1}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleDownload(thumb.imageUrl, i)
                          }
                        >
                          <Download className="h-3.5 w-3.5 mr-1" />
                          Download
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
