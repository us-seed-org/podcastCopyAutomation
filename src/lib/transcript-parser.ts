export interface ParsedTranscript {
  text: string;
  hasTimestamps: boolean;
  segments: TranscriptSegment[];
}

export interface TranscriptSegment {
  startTime: string;
  endTime: string;
  text: string;
}

function parseSrtTimestamp(ts: string): string {
  // Convert "00:01:23,456" to "00:01:23"
  return ts.replace(",", ".").split(".")[0];
}

export function formatTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function parseSrt(content: string): ParsedTranscript {
  const blocks = content.trim().split(/\n\n+/);
  const segments: TranscriptSegment[] = [];
  const textParts: string[] = [];

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 3) continue;

    // Line 1: sequence number
    // Line 2: timestamp range
    // Line 3+: text
    const timestampLine = lines[1];
    const timestampMatch = timestampLine.match(
      /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/
    );

    if (!timestampMatch) continue;

    const text = lines.slice(2).join(" ").trim();
    if (!text) continue;

    segments.push({
      startTime: parseSrtTimestamp(timestampMatch[1]),
      endTime: parseSrtTimestamp(timestampMatch[2]),
      text,
    });
    textParts.push(text);
  }

  return {
    text: textParts.join(" "),
    hasTimestamps: true,
    segments,
  };
}

export function parseTxt(content: string): ParsedTranscript {
  const lines = content.trim().split("\n").filter((l) => l.trim());

  // Check if it has timestamps like "00:01:23 - text" or "[00:01:23] text"
  const timestampPattern = /^[\[(\s]*(\d{1,2}:\d{2}(?::\d{2})?)\s*[\])\s-]+\s*(.+)/;
  const segments: TranscriptSegment[] = [];
  const textParts: string[] = [];
  let hasTimestamps = false;

  for (const line of lines) {
    const match = line.match(timestampPattern);
    if (match) {
      hasTimestamps = true;
      segments.push({
        startTime: match[1],
        endTime: "",
        text: match[2].trim(),
      });
      textParts.push(match[2].trim());
    } else {
      textParts.push(line.trim());
    }
  }

  return {
    text: textParts.join(" "),
    hasTimestamps,
    segments,
  };
}

export function parseTranscript(content: string, filename: string): ParsedTranscript {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "srt") {
    return parseSrt(content);
  }
  return parseTxt(content);
}

export function truncateTranscript(text: string, maxTokens = 30000): string {
  // Rough token estimation: ~4 chars per token
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[Transcript truncated for length]";
}
