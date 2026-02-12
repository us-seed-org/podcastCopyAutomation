"use client";

import { useCallback, useState } from "react";
import { Upload, FileText, X } from "lucide-react";
import { parseTranscript, type ParsedTranscript } from "@/lib/transcript-parser";

interface TranscriptUploadProps {
  onTranscriptParsed: (result: ParsedTranscript) => void;
  currentFile: string | null;
  onClear: () => void;
}

export function TranscriptUpload({ onTranscriptParsed, currentFile, onClear }: TranscriptUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);

      if (!file.name.endsWith(".srt") && !file.name.endsWith(".txt")) {
        setError("Please upload a .srt or .txt file");
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setError("File too large. Maximum 10MB.");
        return;
      }

      try {
        const content = await file.text();
        const result = parseTranscript(content, file.name);

        if (result.text.length < 100) {
          setError("Transcript too short. Please upload a longer transcript.");
          return;
        }

        onTranscriptParsed(result);
      } catch {
        setError("Failed to parse transcript. Please check the file format.");
      }
    },
    [onTranscriptParsed]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  if (currentFile) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
        <FileText className="h-5 w-5 text-green-600" />
        <div className="flex-1">
          <p className="text-sm font-medium text-green-800">{currentFile}</p>
          <p className="text-xs text-green-600">Transcript loaded successfully</p>
        </div>
        <button onClick={onClear} className="text-green-600 hover:text-green-800">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        }`}
        onClick={() => document.getElementById("transcript-input")?.click()}
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm font-medium">Drop your transcript here or click to browse</p>
          <p className="text-xs text-muted-foreground mt-1">Supports .srt and .txt files (max 10MB)</p>
        </div>
        <input
          id="transcript-input"
          type="file"
          accept=".srt,.txt"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
