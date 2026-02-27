"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/score-badge";
import { ArrowLeft, Clock, Trophy, BarChart3, RefreshCw } from "lucide-react";
import Link from "next/link";

interface TitleResult {
  id: string;
  platform: string;
  title: string;
  thumbnail_text: string | null;
  source_model: string;
  score_total: number | null;
  thumb_score_total: number | null;
  was_selected: boolean;
  human_rating: number | null;
  human_notes: string | null;
}

interface ModelPerf {
  model_name: string;
  titles_generated: number;
  titles_selected: number;
  avg_score: number | null;
  avg_thumb_score: number | null;
  had_errors: boolean;
}

interface Run {
  id: string;
  created_at: string;
  podcast_name: string;
  guest_name: string;
  guest_tier: number | null;
  models_used: string[];
  scoring_model: string | null;
  total_candidates_generated: number | null;
  run_duration_ms: number | null;
  status: string;
  titleResults: TitleResult[];
  modelPerformance: ModelPerf[];
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "N/A";
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StarRating({ rating, onChange }: { rating: number | null; onChange: (r: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onChange(star)}
          className={`text-sm ${(rating || 0) >= star ? "text-yellow-400" : "text-muted-foreground/30"} hover:text-yellow-400 transition-colors cursor-pointer`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const fetchRuns = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/runs");
      if (!res.ok) {
        console.error(`Failed to fetch runs: ${res.status} ${res.statusText}`);
        setRuns([]);
        return;
      }
      const data = await res.json();
      setRuns(data.runs || []);
    } catch {
      console.error("Failed to fetch runs");
      setRuns([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const handleRate = async (titleResultId: string, humanRating: number) => {
    try {
      const res = await fetch("/api/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titleResultId, humanRating }),
      });
      if (!res.ok) {
        console.error(`Failed to save rating: ${res.status} ${res.statusText}`);
        return;
      }
      // Update local state only on success
      setRuns((prev) =>
        prev.map((run) => ({
          ...run,
          titleResults: run.titleResults.map((tr) =>
            tr.id === titleResultId ? { ...tr, human_rating: humanRating } : tr
          ),
        }))
      );
    } catch {
      console.error("Failed to save rating");
    }
  };

  // Aggregate model stats across all runs
  const modelLeaderboard = new Map<string, { totalGenerated: number; totalSelected: number; totalScore: number; scoredCount: number; runs: number }>();
  for (const run of runs) {
    for (const mp of run.modelPerformance) {
      const existing = modelLeaderboard.get(mp.model_name) || { totalGenerated: 0, totalSelected: 0, totalScore: 0, scoredCount: 0, runs: 0 };
      existing.totalGenerated += mp.titles_generated;
      existing.totalSelected += mp.titles_selected;
      if (mp.avg_score !== null && mp.avg_score !== undefined) {
        existing.totalScore += mp.avg_score * mp.titles_generated;
        existing.scoredCount += mp.titles_generated;
      }
      existing.runs++;
      modelLeaderboard.set(mp.model_name, existing);
    }
  }

  const selectedRun = runs.find((r) => r.id === selectedRunId);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/generate">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Run History</h1>
              <p className="text-sm text-muted-foreground">{runs.length} generation runs tracked</p>
            </div>
          </div>
          <Button variant="outline" onClick={fetchRuns} className="gap-2" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Model Leaderboard */}
        {modelLeaderboard.size > 0 && (
          <Card className="border-border/50 bg-card/50">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="h-5 w-5 text-amber-500" />
                <h3 className="text-lg font-semibold">Model Leaderboard</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border/50">
                      <th className="pb-2 font-medium">Model</th>
                      <th className="pb-2 font-medium text-right">Generated</th>
                      <th className="pb-2 font-medium text-right">Selected</th>
                      <th className="pb-2 font-medium text-right">Selection Rate</th>
                      <th className="pb-2 font-medium text-right">Avg Score</th>
                      <th className="pb-2 font-medium text-right">Runs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(modelLeaderboard.entries())
                      .sort((a, b) => {
                        const rateA = a[1].totalGenerated > 0 ? a[1].totalSelected / a[1].totalGenerated : 0;
                        const rateB = b[1].totalGenerated > 0 ? b[1].totalSelected / b[1].totalGenerated : 0;
                        return rateB - rateA;
                      })
                      .map(([name, stats]) => (
                        <tr key={name} className="border-b border-border/30">
                          <td className="py-2 font-medium">{name}</td>
                          <td className="py-2 text-right">{stats.totalGenerated}</td>
                          <td className="py-2 text-right">{stats.totalSelected}</td>
                          <td className="py-2 text-right">
                            {stats.totalGenerated > 0
                              ? `${Math.round((stats.totalSelected / stats.totalGenerated) * 100)}%`
                              : "N/A"}
                          </td>
                          <td className="py-2 text-right">
                            {stats.scoredCount > 0
                              ? Math.round(stats.totalScore / stats.scoredCount)
                              : "N/A"}
                          </td>
                          <td className="py-2 text-right">{stats.runs}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Run Detail View */}
        {selectedRun && (
          <Card className="border-border/50 bg-card/50">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">{selectedRun.guest_name} - {selectedRun.podcast_name}</h3>
                  <p className="text-sm text-muted-foreground">{formatDate(selectedRun.created_at)}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedRunId(null)}>Close</Button>
              </div>
              <div className="space-y-3">
                {selectedRun.titleResults
                  .filter((tr) => tr.was_selected)
                  .map((tr) => (
                    <div key={tr.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${tr.platform === "youtube" ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                        {tr.platform}
                      </span>
                      <span className="flex-1 text-sm font-medium">{tr.title}</span>
                      {tr.score_total && <ScoreBadge score={tr.score_total} />}
                      <StarRating rating={tr.human_rating} onChange={(r) => handleRate(tr.id, r)} />
                      <span className="text-xs text-muted-foreground">{tr.source_model}</span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Runs List */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-500" />
            <h3 className="text-lg font-semibold">Recent Runs</h3>
          </div>
          {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {!loading && runs.length === 0 && (
            <p className="text-sm text-muted-foreground">No runs yet. Generate some titles first!</p>
          )}
          {runs.map((run) => {
            const selectedTitles = run.titleResults.filter((tr) => tr.was_selected);
            const bestScore = Math.max(0, ...selectedTitles.map((tr) => tr.score_total || 0));
            const modelBreakdown = run.modelPerformance
              .filter((mp) => mp.titles_selected > 0)
              .map((mp) => mp.model_name)
              .join(", ");

            return (
              <Card
                key={run.id}
                className={`border-border/50 bg-card/50 cursor-pointer transition-all hover:border-border hover:shadow-md ${selectedRunId === run.id ? "border-primary" : ""}`}
                onClick={() => setSelectedRunId(run.id === selectedRunId ? null : run.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{run.guest_name}</span>
                          <span className="text-xs text-muted-foreground">on {run.podcast_name}</span>
                          {run.guest_tier && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              Tier {run.guest_tier}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>{formatDate(run.created_at)}</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDuration(run.run_duration_ms)}
                          </span>
                          <span>{selectedTitles.length} titles selected</span>
                          {modelBreakdown && <span>via {modelBreakdown}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {bestScore > 0 && <ScoreBadge score={bestScore} />}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${run.status === "complete" ? "bg-emerald-500/10 text-emerald-400" : run.status === "error" ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"}`}>
                        {run.status}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
