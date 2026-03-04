"use client";

import { useState, useEffect, useRef } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HumanFeedbackProps {
    titleResultId?: string;
    initialRating?: number;
    initialNotes?: string;
}

export function HumanFeedback({
    titleResultId,
    initialRating,
    initialNotes,
}: HumanFeedbackProps) {
    const [rating, setRating] = useState<number>(initialRating || 0);
    const [hoveredStar, setHoveredStar] = useState<number>(0);
    const [notes, setNotes] = useState(initialNotes || "");
    const [showNotes, setShowNotes] = useState(Boolean(initialRating || initialNotes));
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    useEffect(() => {
        if (initialRating !== undefined) setRating(initialRating);
        if (initialNotes !== undefined) setNotes(initialNotes);
        if (initialRating || initialNotes) {
            setShowNotes(true);
        }
    }, [initialRating, initialNotes]);

    if (!titleResultId) return null;

    const handleSave = async () => {
        if (rating === 0) return;
        setSaving(true);
        setSaveError(null);
        try {
            const res = await fetch("/api/rate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    titleResultId,
                    humanRating: rating,
                    humanNotes: notes || undefined,
                }),
            });
            if (res.ok) {
                if (isMounted.current) {
                    setSaved(true);
                    setSaveError(null);
                }
                setTimeout(() => {
                    if (isMounted.current) setSaved(false);
                }, 2000);
            } else {
                setSaveError("Failed to save rating");
            }
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : "Failed to save rating");
        } finally {
            setSaving(false);
        }
    };

    const displayRating = hoveredStar || rating;

    return (
        <div className="flex items-center gap-3 pt-2 border-t border-border/30">
            <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        type="button"
                        aria-label={`Rate ${star} out of 5`}
                        aria-pressed={star <= displayRating}
                        onClick={() => {
                            setRating(star);
                            if (!showNotes) setShowNotes(true);
                        }}
                        onMouseEnter={() => setHoveredStar(star)}
                        onMouseLeave={() => setHoveredStar(0)}
                        className="p-0.5 transition-transform hover:scale-110"
                    >
                        <Star
                            className={`h-4 w-4 transition-colors ${star <= displayRating
                                ? "fill-amber-400 text-amber-400"
                                : "text-muted-foreground/40"
                                }`}
                        />
                    </button>
                ))}
            </div>

            {rating > 0 && (
                <span className="text-[10px] text-muted-foreground">
                    {rating}/5
                </span>
            )}

            {showNotes && (
                <>
                    <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add a note..."
                        aria-label="Add a note"
                        className="flex-1 text-xs bg-transparent border-b border-border/50 focus:border-primary/50 outline-none py-1 text-foreground placeholder:text-muted-foreground/50"
                    />
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleSave}
                        disabled={saving || rating === 0}
                        className="h-6 px-2 text-[10px]"
                    >
                        {saved ? "✓ Saved" : saving ? "..." : "Save"}
                    </Button>
                </>
            )}

            {saveError && (
                <span className="text-[10px] text-red-400">{saveError}</span>
            )}
        </div>
    );
}
