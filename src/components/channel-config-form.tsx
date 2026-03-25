"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChannelConfig } from "@/types/channel-config";

interface ChannelConfigFormProps {
  initial?: Partial<ChannelConfig>;
  onSave: (data: Omit<ChannelConfig, "id" | "created_at" | "updated_at">) => Promise<void>;
  onCancel?: () => void;
  saving?: boolean;
}

export function ChannelConfigForm({ initial, onSave, onCancel, saving }: ChannelConfigFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [systemPrompt, setSystemPrompt] = useState(initial?.system_prompt ?? "");
  const [tone, setTone] = useState(initial?.voice_guidelines?.tone ?? "");
  const [style, setStyle] = useState(initial?.voice_guidelines?.style ?? "");
  const [personality, setPersonality] = useState(initial?.voice_guidelines?.personality ?? "");
  const [bannedPhrases, setBannedPhrases] = useState(
    (initial?.banned_phrases ?? []).join("\n")
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Name is required";
    if (!systemPrompt.trim()) e.system_prompt = "System prompt is required";
    if (systemPrompt.length > 4000) e.system_prompt = "Max 4000 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const phrases = bannedPhrases
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);

    await onSave({
      name: name.trim(),
      system_prompt: systemPrompt.trim(),
      voice_guidelines: {
        tone: tone.trim() || undefined,
        style: style.trim() || undefined,
        personality: personality.trim() || undefined,
      },
      banned_phrases: phrases,
      preferred_archetypes: initial?.preferred_archetypes ?? [],
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Config Name *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. My Podcast Channel"
          maxLength={100}
        />
        {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="system_prompt">Channel System Prompt *</Label>
        <p className="text-xs text-muted-foreground">
          Describe your channel&apos;s voice, audience, and goals. This is injected at the top of every generation prompt.
        </p>
        <Textarea
          id="system_prompt"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="e.g. This channel targets B2B founders and operators. Titles should feel direct and insider-ish — not hype-y. The audience is skeptical of buzzwords..."
          rows={8}
          maxLength={4000}
        />
        <p className="text-xs text-muted-foreground text-right">{systemPrompt.length}/4000</p>
        {errors.system_prompt && <p className="text-sm text-red-500">{errors.system_prompt}</p>}
      </div>

      <div className="space-y-4">
        <Label>Voice Guidelines (optional)</Label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="tone" className="text-xs">Tone</Label>
            <Input
              id="tone"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              placeholder="e.g. direct, dry wit"
              maxLength={200}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="style" className="text-xs">Style</Label>
            <Input
              id="style"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="e.g. punchy, data-driven"
              maxLength={200}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="personality" className="text-xs">Personality</Label>
            <Input
              id="personality"
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              placeholder="e.g. skeptical insider"
              maxLength={200}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="banned_phrases">Additional Banned Phrases (one per line, optional)</Label>
        <Textarea
          id="banned_phrases"
          value={bannedPhrases}
          onChange={(e) => setBannedPhrases(e.target.value)}
          placeholder="game-changer&#10;disrupt&#10;unlock your potential"
          rows={4}
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Config"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
