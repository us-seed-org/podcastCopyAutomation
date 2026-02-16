import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getScoreColor(score: number): string {
  if (score >= 85) return "text-emerald-500";
  if (score >= 72) return "text-blue-500";
  if (score >= 60) return "text-yellow-500";
  return "text-red-500";
}

export function getScoreBgColor(score: number): string {
  if (score >= 85) return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
  if (score >= 72) return "bg-blue-500/10 text-blue-700 border-blue-500/20";
  if (score >= 60) return "bg-yellow-500/10 text-yellow-700 border-yellow-500/20";
  return "bg-red-500/10 text-red-700 border-red-500/20";
}

export function getScoreLabel(score: number): string {
  if (score >= 85) return "Viral Potential";
  if (score >= 72) return "Strong";
  if (score >= 60) return "Decent";
  return "Needs Work";
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
