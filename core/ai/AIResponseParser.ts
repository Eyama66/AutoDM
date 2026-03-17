/**
 * AIResponseParser.ts
 *
 * Two-path parser for AI responses.
 *
 * Path 1 — JSON envelope  : { narrative: { segments }, protocol: { actionText } }
 * Path 2 — Legacy tags    : <<NPC:Name>>...<</NPC>>, <<HINT>>...<</HINT>>
 *
 * Always returns a unified ParsedAIResponse:
 *   renderEnvelope — consumed by DmMessageRenderer (UI)
 *   protocolText   — consumed by ActionProcessor.parse() (engine)
 *   historyText    — stored in AI conversation history (never a JSON blob)
 *
 * The legacy parsing logic is ported from web-client/src/narrativeParser.js.
 * narrativeParser.js is now deprecated; see docs/response_protocol.md.
 */

import type {
  AIResponseEnvelope,
  NarrativeSegment,
  ParsedAIResponse,
} from "./AIResponseEnvelope.js";

// ─── JSON Envelope Path ───────────────────────────────────────────────────────

function tryParseJsonEnvelope(rawText: string): AIResponseEnvelope | null {
  const trimmed = rawText.trim();
  if (!trimmed.startsWith("{")) return null;

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const narrative = parsed.narrative as Record<string, unknown> | undefined;
    if (!narrative || !Array.isArray(narrative.segments)) return null;

    const segments: NarrativeSegment[] = [];
    for (const seg of narrative.segments as unknown[]) {
      const s = seg as Record<string, unknown>;
      if (!s || typeof s.type !== "string" || typeof s.content !== "string") {
        continue;
      }
      if (s.type === "narration") {
        segments.push({ type: "narration", content: s.content });
      } else if (s.type === "dialogue" && typeof s.speaker === "string") {
        segments.push({ type: "dialogue", speaker: s.speaker, content: s.content });
      } else if (s.type === "hint") {
        segments.push({ type: "hint", content: s.content });
      }
    }

    const protocol = parsed.protocol as Record<string, unknown> | undefined;
    const actionText =
      typeof protocol?.actionText === "string" ? protocol.actionText : "";

    return { narrative: { segments }, protocol: { actionText } };
  } catch {
    return null;
  }
}

// ─── Legacy Tag Parser (ported from web-client/src/narrativeParser.js) ────────

// Matches <<NPC: Name>>content<</NPC>> and <<HINT>>content<</HINT>>
// Global flag requires manual lastIndex reset before each use.
const SEGMENT_REGEX =
  /<<NPC:\s*(.+?)>>([\s\S]*?)<<\/NPC>>|<<HINT>>([\s\S]*?)<<\/HINT>>/g;

/** Fix <<HINT>>...<<HINT>> (model omits closing tag) */
function normalizeHintTags(text: string): string {
  return text.replace(/<<HINT>>([\s\S]*?)<<HINT>>/g, "<<HINT>>$1<</HINT>>");
}

/** Auto-insert <</NPC>> when the model omits the closing tag */
function autoCloseNpcTags(text: string): string {
  const parts = text.split(/(<<NPC:\s*[^>]+>>)/);
  if (parts.length === 1) return text;

  const out: string[] = [];
  let pendingNpc = false;

  for (const part of parts) {
    const isOpenTag = /^<<NPC:\s*[^>]+>>$/.test(part);
    if (isOpenTag) {
      if (pendingNpc) out.push("<</NPC>>");
      out.push(part);
      pendingNpc = true;
    } else {
      if (pendingNpc && part.includes("<</NPC>>")) pendingNpc = false;
      out.push(part);
    }
  }

  if (pendingNpc) out.push("<</NPC>>");
  return out.join("");
}

/** Strip inner <<...>> stage directions; remove outer Chinese/curly quotes */
function normalizeDialogueContent(content: string): string {
  const withoutBeats = String(content || "").replace(/<<[\s\S]*?>>/g, "");
  const trimmed = withoutBeats.trim();
  const fullyQuoted = trimmed.match(/^[""](.+?)[""]$/s);
  return fullyQuoted ? (fullyQuoted[1] ?? trimmed).trim() : trimmed;
}

/**
 * Split an NPC dialogue block into individual paragraph segments.
 * When a block contains multiple adjacent quoted lines, each becomes its own segment.
 */
function splitDialogueParagraphs(dialogue: string): string[] {
  const paragraphs = String(dialogue || "")
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return paragraphs.flatMap((paragraph) => {
    const lines = paragraph
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length > 1 && lines.every((l) => /^[""].+/.test(l))) {
      return lines;
    }
    return [paragraph];
  });
}

function pushDialogueSegments(
  segments: NarrativeSegment[],
  speaker: string,
  dialogue: string,
): void {
  for (const paragraph of splitDialogueParagraphs(dialogue)) {
    const content = normalizeDialogueContent(paragraph);
    if (content) segments.push({ type: "dialogue", speaker, content });
  }
}

function flushNarrationBuffer(segments: NarrativeSegment[], buffer: string[]): void {
  const content = buffer.join("\n").trim();
  if (content) segments.push({ type: "narration", content });
  buffer.length = 0;
}

function isLikelySpeakerLabel(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 24) return false;
  if (/[。！？.!?:：]/.test(trimmed)) return false;
  return true;
}

function isLikelyDialogueLine(line: string): boolean {
  return /^[""]/.test(line.trim());
}

/**
 * Heuristic fallback for text with no <<...>> tags.
 * Detects "SpeakerName\n\"dialogue line\"" patterns.
 */
function parseLooseNarrativeContent(rawContent: string): NarrativeSegment[] {
  const segments: NarrativeSegment[] = [];
  const narrationBuffer: string[] = [];
  const lines = String(rawContent || "").split("\n");

  let index = 0;
  while (index < lines.length) {
    const currentLine = lines[index] ?? "";
    const trimmedLine = currentLine.trim();

    if (
      isLikelySpeakerLabel(trimmedLine) &&
      index + 1 < lines.length &&
      isLikelyDialogueLine(lines[index + 1] ?? "")
    ) {
      flushNarrationBuffer(segments, narrationBuffer);

      const speaker = trimmedLine;
      const dialogueLines: string[] = [];
      index += 1;

      while (index < lines.length) {
        const line = lines[index] ?? "";
        const trimmed = line.trim();

        if (!trimmed) {
          if (dialogueLines.length > 0) dialogueLines.push("");
          index += 1;
          continue;
        }

        if (!isLikelyDialogueLine(trimmed)) break;

        dialogueLines.push(trimmed);
        index += 1;
      }

      pushDialogueSegments(segments, speaker, dialogueLines.join("\n"));
      continue;
    }

    narrationBuffer.push(currentLine);
    index += 1;
  }

  flushNarrationBuffer(segments, narrationBuffer);
  return segments;
}

/** Parse legacy <<NPC>>/<<HINT>> tag format into an AIResponseEnvelope */
function parseLegacyText(rawContent: string): AIResponseEnvelope {
  const normalized = autoCloseNpcTags(normalizeHintTags(rawContent));
  const segments: NarrativeSegment[] = [];
  let lastIndex = 0;

  SEGMENT_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = SEGMENT_REGEX.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      const before = normalized.slice(lastIndex, match.index).trim();
      if (before) segments.push({ type: "narration", content: before });
    }

    if (match[1] !== undefined) {
      // <<NPC: Name>>content<</NPC>>
      const speaker = match[1].trim();
      const dialogue = (match[2] || "").trim();
      if (dialogue) pushDialogueSegments(segments, speaker, dialogue);
    } else if (match[3] !== undefined) {
      // <<HINT>>content<</HINT>>
      const hint = (match[3] || "").trim();
      if (hint) segments.push({ type: "hint", content: hint });
    }

    lastIndex = match.index + match[0].length;
  }

  const tail = normalized.slice(lastIndex).trim();
  if (tail) segments.push(...parseLooseNarrativeContent(tail));

  // No tags at all — fall back to loose speaker/dialogue heuristic
  if (segments.length === 0) {
    return {
      narrative: { segments: parseLooseNarrativeContent(normalized.trim()) },
      protocol: { actionText: "" },
    };
  }

  return { narrative: { segments }, protocol: { actionText: "" } };
}

// ─── History Flattener ────────────────────────────────────────────────────────

/**
 * Flatten narrative segments into plain text for AI conversation history.
 *
 * Phase 2 baseline — refined by historyFormatter.ts in Phase 6.
 *
 * narration → content verbatim
 * dialogue  → "Name：content"
 * hint      → omitted (player-facing only; AI doesn't need to remember hints it gave)
 */
export function flattenSegmentsToHistory(segments: NarrativeSegment[]): string {
  return segments
    .flatMap((seg): string[] => {
      if (seg.type === "narration") return [seg.content];
      if (seg.type === "dialogue") return [`${seg.speaker}：${seg.content}`];
      return [];
    })
    .join("\n")
    .trim();
}

// ─── Main Entry ───────────────────────────────────────────────────────────────

const EMPTY_RESPONSE: ParsedAIResponse = {
  format: "legacy",
  renderEnvelope: {
    narrative: { segments: [{ type: "narration", content: "" }] },
    protocol: { actionText: "" },
  },
  protocolText: "",
  historyText: "",
};

/**
 * Parse a raw AI response (or cleanText) into a unified ParsedAIResponse.
 *
 * Detection order:
 *   1. rawText.trim() starts with '{' → try JSON envelope
 *   2. Otherwise (or on JSON parse failure) → legacy tag format
 */
export function parseAIResponse(rawText: string): ParsedAIResponse {
  if (!rawText || typeof rawText !== "string") return EMPTY_RESPONSE;

  // Path 1: JSON envelope
  const envelope = tryParseJsonEnvelope(rawText);
  if (envelope) {
    return {
      format: "json",
      renderEnvelope: envelope,
      protocolText: envelope.protocol.actionText,
      historyText: flattenSegmentsToHistory(envelope.narrative.segments),
    };
  }

  // Path 2: Legacy tag format
  const legacyEnvelope = parseLegacyText(rawText);
  return {
    format: "legacy",
    renderEnvelope: legacyEnvelope,
    protocolText: rawText,
    historyText: flattenSegmentsToHistory(legacyEnvelope.narrative.segments),
  };
}
