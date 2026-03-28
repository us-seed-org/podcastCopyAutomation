"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SuggestedAction } from "@/types/chat";

const ACTION_DESCRIPTIONS: Record<SuggestedAction["type"], string> = {
  regenerate: "re-generate titles for the specified archetype",
  rescore: "re-score all existing titles with the scoring panel",
  rerank: "re-run the pairwise ranking tournament",
  recontent: "re-generate descriptions and chapters",
};

interface ActionConfirmModalProps {
  action: SuggestedAction;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ActionConfirmModal({ action, onConfirm, onCancel }: ActionConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6 space-y-4">
          <div>
            <h3 className="font-semibold text-base mb-1">Confirm action</h3>
            <p className="text-sm text-muted-foreground">
              This will {ACTION_DESCRIPTIONS[action.type]}.{" "}
              {action.description && action.description !== ACTION_DESCRIPTIONS[action.type]
                ? `"${action.description}"`
                : ""}
            </p>
            {action.parameters && Object.keys(action.parameters).length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Parameters: {JSON.stringify(action.parameters)}
              </p>
            )}
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={onConfirm}>
              Continue
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
