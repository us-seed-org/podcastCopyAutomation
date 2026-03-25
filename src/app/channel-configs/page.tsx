"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChannelConfigForm } from "@/components/channel-config-form";
import { Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ChannelConfig } from "@/types/channel-config";

type View = "list" | "create" | { edit: ChannelConfig };

export default function ChannelConfigsPage() {
  const [configs, setConfigs] = useState<ChannelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("list");

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/channel-configs");
      if (!res.ok) throw new Error("Failed to load configs");
      const { data } = await res.json();
      setConfigs(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const handleCreate = async (data: Omit<ChannelConfig, "id" | "created_at" | "updated_at">) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/channel-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(JSON.stringify(err.error));
      }
      await loadConfigs();
      setView("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (
    id: string,
    data: Omit<ChannelConfig, "id" | "created_at" | "updated_at">
  ) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/channel-configs/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(JSON.stringify(err.error));
      }
      await loadConfigs();
      setView("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (deletingId) return;
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/channel-configs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setConfigs((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  if (view === "create") {
    return (
      <div className="container max-w-2xl py-8">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setView("list")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-2xl font-bold">New Channel Config</h1>
        </div>
        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}
        <Card>
          <CardContent className="pt-6">
            <ChannelConfigForm
              onSave={handleCreate}
              onCancel={() => setView("list")}
              saving={saving}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (typeof view === "object" && "edit" in view) {
    const config = view.edit;
    return (
      <div className="container max-w-2xl py-8">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setView("list")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-2xl font-bold">Edit: {config.name}</h1>
        </div>
        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}
        <Card>
          <CardContent className="pt-6">
            <ChannelConfigForm
              initial={config}
              onSave={(data) => handleUpdate(config.id, data)}
              onCancel={() => setView("list")}
              saving={saving}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Home
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Channel Configs</h1>
        </div>
        <Button onClick={() => setView("create")}>
          <Plus className="h-4 w-4 mr-2" /> New Config
        </Button>
      </div>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : configs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No channel configs yet.</p>
            <Button onClick={() => setView("create")}>
              <Plus className="h-4 w-4 mr-2" /> Create your first config
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {configs.map((config) => (
            <Card key={config.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium truncate">{config.name}</h3>
                      {Array.isArray(config.preferred_archetypes) && config.preferred_archetypes.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {config.preferred_archetypes.map((a) => (
                            <Badge key={a} variant="secondary" className="text-xs">
                              {a}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {config.system_prompt}
                    </p>
                    {config.voice_guidelines?.tone && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Tone: {config.voice_guidelines.tone}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setView({ edit: config })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(config.id, config.name)}
                      disabled={deletingId === config.id}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
