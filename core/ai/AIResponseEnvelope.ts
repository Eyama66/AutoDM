/**
 * AIResponseEnvelope.ts
 *
 * Protocol types for the hybrid AI response format.
 * See: docs/response_protocol.md
 */

export type NarrationSegment = {
  type: "narration";
  content: string;
};

export type DialogueSegment = {
  type: "dialogue";
  speaker: string;
  content: string;
};

export type HintSegment = {
  type: "hint";
  content: string;
};

export type NarrativeSegment = NarrationSegment | DialogueSegment | HintSegment;

/**
 * Structured AI response envelope.
 *
 * narrative.segments — ordered presentation units for the UI renderer.
 *                      MUST NOT contain [@ACTION(...)] tags.
 * protocol.actionText — raw text with [@ACTION(...)] tags for ActionProcessor.
 *                       May be an empty string.
 */
export type AIResponseEnvelope = {
  narrative: {
    segments: NarrativeSegment[];
  };
  protocol: {
    actionText: string;
  };
};

/**
 * Unified output from AIResponseParser.parseAIResponse().
 *
 * renderEnvelope — consumed by DmMessageRenderer (UI only)
 * protocolText   — consumed by ActionProcessor.parse() (engine only)
 * historyText    — stored in AI conversation history (never a JSON blob)
 */
export type ParsedAIResponse = {
  format: "json" | "legacy";
  renderEnvelope: AIResponseEnvelope;
  protocolText: string;
  historyText: string;
};
