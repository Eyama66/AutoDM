# AutoDM AI Response Protocol

## Overview

The AI response protocol defines how the LLM output is split across three consumers:

| Field | Produced by | Consumed by |
|---|---|---|
| `renderEnvelope` | `AIResponseParser` | `DmMessageRenderer` (UI only) |
| `protocolText` | `AIResponseParser` | `ActionProcessor.parse()` (engine only) |
| `historyText` | `flattenSegmentsToHistory()` | AI conversation history |

**Hard rule**: these three fields never mix. The UI does not touch `protocolText`. The engine does not touch `renderEnvelope`. The AI never receives a JSON blob as history.

---

## Response Formats

### Runtime Switch

`AIEngine` now supports three protocol modes via `VITE_AI_RESPONSE_PROTOCOL_MODE`:

| Mode | Meaning |
|---|---|
| `legacy` | Keep the old `<<NPC>> / <<HINT>>` tag protocol |
| `json_object` | Native JSON mode via `response_format: { type: "json_object" }` |
| `json_text` | Ask for the JSON envelope in plain text, but do not force native JSON mode |

Recommended A/B gate:
- Baseline: `legacy`
- Variant A: `json_object`
- Variant B: `json_text`

Use the same scene prompts and compare:
- narrative length
- naturalness
- malformed output rate
- scene fact drift rate

### Format A — JSON Envelope (new protocol, Phase 5+)

The AI outputs a single JSON object:

```json
{
  "narrative": {
    "segments": [
      { "type": "narration", "content": "他弹了弹烟灰。" },
      { "type": "dialogue", "speaker": "看守员", "content": "令牌？" },
      { "type": "hint", "content": "你可以出示令牌，或试图说服他。" }
    ]
  },
  "protocol": {
    "actionText": "[@CHECK(说服:13:说服看守员放行)]"
  }
}
```

Rules:
- `narrative.segments` are ordered. Types: `narration` | `dialogue` | `hint`.
- `dialogue` segments MUST have a `speaker` field.
- `hint` segments MUST NOT have a `speaker` field.
- `segments[].content` MUST NOT contain `[@ACTION(...)]` tags. Action tags belong exclusively in `protocol.actionText`.
- `protocol.actionText` may be an empty string.

### Format B — Legacy Tags (pre-Phase 5, fallback)

The AI outputs free text with embedded presentation tags:

```
他弹了弹烟灰。

<<NPC:看守员>>令牌？<</NPC>>

<<HINT>>你可以出示令牌，或试图说服他。<</HINT>>

[@CHECK(说服:13:说服看守员放行)]
```

This format is fully supported by `AIResponseParser` as the fallback path. New code should never introduce additional malformed-tag band-aids; fix them upstream in the AI prompt or move to Format A.

---

## Three-Field Contract

### `renderEnvelope: AIResponseEnvelope`

```typescript
type AIResponseEnvelope = {
  narrative: { segments: NarrativeSegment[] };
  protocol: { actionText: string };
};
```

`DmMessageRenderer` only reads `renderEnvelope.narrative.segments`. It never touches `protocolText` or `historyText`.

### `protocolText: string`

- **JSON path**: equals `envelope.protocol.actionText`
- **Legacy path**: equals the full raw AI text (action tags present)

Fed to `ActionProcessor.parse(protocolText)` inside `CampaignManager.processAiResponse()`. No other consumer.

### `historyText: string`

Flattened plain text produced by `flattenSegmentsToHistory(segments)`:

| Segment type | historyText representation |
|---|---|
| `narration` | content verbatim |
| `dialogue` | `Name：content` |
| `hint` | omitted |

This text is stored as the `assistant` role content in AI conversation history. JSON blobs are never stored in history.

---

## Two-Path Parser

`AIResponseParser.parseAIResponse(rawText)` detection logic:

1. If `rawText.trim()` starts with `{` → try `JSON.parse` → validate `narrative.segments` shape → **JSON path**
2. Otherwise (or if JSON parse fails) → **legacy path**

The legacy path is also used as a fallback for any malformed JSON.

---

## Enforcement Points

| Constraint | Where enforced |
|---|---|
| `segments[].content` has no action tags (JSON path) | `AIResponseParser` validates during parsing |
| Action tags in `protocol.actionText` only | AI system prompt (Phase 5) |
| History never stores JSON blobs | `buildAiTransportMessage` + `flattenSegmentsToHistory` (Phase 6) |
| Validator reads `segments` + `protocolText` | `NarrativeBoundaryValidator` (Phase 7A/7B) |

---

## Migration Phases

| Phase | Change |
|---|---|
| 0 | This document. Protocol contracts fixed. |
| 1 | `AIResponseEnvelope.ts` type definitions. |
| 2 | `AIResponseParser.ts` — two-path parser, legacy fallback included. |
| 3 | `DmMessageRenderer` consumes `renderEnvelope.narrative.segments`. `narrativeParser.js` demoted to deprecated. |
| 7A | `NarrativeBoundaryValidator` dual-stack support. |
| A/B Gate | Validate JSON mode narrative quality. |
| 5 | `promptBuilder.ts` + `AIEngine.ts` switched to JSON envelope output. |
| 6 | `historyFormatter.ts` + `buildAiTransportMessage` use `historyText`. |
| 7B | Validator migrated to envelope as primary input. |
| 8 | Regression tests. Legacy path retained as fallback only. |
