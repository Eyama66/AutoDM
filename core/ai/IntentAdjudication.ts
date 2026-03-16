import type { ActionType } from "../engine/ActionProcessor.js";

/**
 * `IntentAdjudication` 是前后端共享的契约草案。
 * 当前阶段它用于前端 mock / shadow / debug，不代表权威裁定最终留在浏览器。
 */
export type IntentType =
  | "move"
  | "talk"
  | "inspect"
  | "loot"
  | "use_item"
  | "combat"
  | "social"
  | "wild_request"
  | "unknown";

export type IntentJudgment =
  | "allowed"
  | "blocked"
  | "partial"
  | "requires_check"
  | "clarify";

export type IntentReason =
  | "unknown_npc"
  | "unknown_location"
  | "scene_not_connected"
  | "plot_locked"
  | "item_unavailable"
  | "encounter_unavailable"
  | "not_in_scene"
  | "insufficient_context"
  | "unsupported_action";

export type NarrativeDirective =
  | "stay_in_scene"
  | "acknowledge_player_intent"
  | "deny_unknown_entity"
  | "offer_scene_options"
  | "preserve_tension";

export interface IntentTargets {
  npcNames: string[];
  locationRefs: string[];
  itemNames: string[];
  encounterIds: string[];
}

export interface ProposedCheck {
  skill: string;
  reason: string;
  dc?: number;
}

export interface ProposedActionCandidate {
  type: ActionType;
  payload: string;
  rationale?: string;
}

export interface IntentAdjudication {
  summary: string;
  intentType: IntentType;
  judgment: IntentJudgment;
  reasons: IntentReason[];
  targets: IntentTargets;
  proposedChecks: ProposedCheck[];
  proposedActions: ProposedActionCandidate[];
  narrativeDirectives: NarrativeDirective[];
}

const VALID_INTENT_TYPES = new Set<IntentType>([
  "move",
  "talk",
  "inspect",
  "loot",
  "use_item",
  "combat",
  "social",
  "wild_request",
  "unknown",
]);

const VALID_JUDGMENTS = new Set<IntentJudgment>([
  "allowed",
  "blocked",
  "partial",
  "requires_check",
  "clarify",
]);

const VALID_REASONS = new Set<IntentReason>([
  "unknown_npc",
  "unknown_location",
  "scene_not_connected",
  "plot_locked",
  "item_unavailable",
  "encounter_unavailable",
  "not_in_scene",
  "insufficient_context",
  "unsupported_action",
]);

const VALID_DIRECTIVES = new Set<NarrativeDirective>([
  "stay_in_scene",
  "acknowledge_player_intent",
  "deny_unknown_entity",
  "offer_scene_options",
  "preserve_tension",
]);

const VALID_ACTION_TYPES = new Set<ActionType>([
  "@MOVE",
  "@PLOT_UPDATE",
  "@ATTR_UPDATE",
  "@ITEM_ADD",
  "@INIT_COMBAT",
  "@COMBAT_START",
  "@ATTACK",
  "@COMBAT_END",
  "@VAR_UPDATE",
  "@STATUS_ADD",
  "@STATUS_REMOVE",
  "@CHECK",
  "@CHECK_SET",
  "@ROLL",
  "@SESSION_END",
  "@NARRATE",
]);

export function createFallbackAdjudication(
  summary = "需要先澄清玩家意图。",
): IntentAdjudication {
  return {
    summary,
    intentType: "unknown",
    judgment: "clarify",
    reasons: ["insufficient_context"],
    targets: {
      npcNames: [],
      locationRefs: [],
      itemNames: [],
      encounterIds: [],
    },
    proposedChecks: [],
    proposedActions: [],
    narrativeDirectives: ["acknowledge_player_intent", "stay_in_scene"],
  };
}

export function parseIntentAdjudication(rawText: string): IntentAdjudication | null {
  const jsonBlock = extractFirstJsonObject(rawText);
  if (!jsonBlock) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonBlock);
    return normalizeIntentAdjudication(parsed);
  } catch {
    return null;
  }
}

export function normalizeIntentAdjudication(value: unknown): IntentAdjudication | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const intentType = normalizeEnum(candidate.intentType, VALID_INTENT_TYPES, "unknown");
  const judgment = normalizeEnum(candidate.judgment, VALID_JUDGMENTS, "clarify");
  const summary = normalizeString(candidate.summary);
  if (!summary || !intentType || !judgment) {
    return null;
  }

  return {
    summary,
    intentType,
    judgment,
    reasons: normalizeEnumList(candidate.reasons, VALID_REASONS),
    targets: {
      npcNames: normalizeStringList(candidate.targets, "npcNames"),
      locationRefs: normalizeStringList(candidate.targets, "locationRefs"),
      itemNames: normalizeStringList(candidate.targets, "itemNames"),
      encounterIds: normalizeStringList(candidate.targets, "encounterIds"),
    },
    proposedChecks: normalizeChecks(candidate.proposedChecks),
    proposedActions: normalizeActionCandidates(candidate.proposedActions),
    narrativeDirectives: normalizeEnumList(
      candidate.narrativeDirectives,
      VALID_DIRECTIVES,
    ),
  };
}

function extractFirstJsonObject(rawText: string): string | null {
  const text = String(rawText || "").trim();
  if (!text) {
    return null;
  }

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidateText = fenceMatch?.[1] || text;
  const startIndex = candidateText.indexOf("{");
  if (startIndex < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = startIndex; index < candidateText.length; index += 1) {
    const char = candidateText[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char !== "}") {
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return candidateText.slice(startIndex, index + 1);
    }
  }

  return null;
}

function normalizeChecks(value: unknown): ProposedCheck[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const candidate = entry as Record<string, unknown>;
    const skill = normalizeString(candidate.skill);
    const reason = normalizeString(candidate.reason);
    const dcValue = typeof candidate.dc === "number" ? candidate.dc : undefined;
    if (!skill || !reason) {
      return [];
    }

    return [
      {
        skill,
        reason,
        ...(typeof dcValue === "number" ? { dc: dcValue } : {}),
      },
    ];
  });
}

function normalizeActionCandidates(value: unknown): ProposedActionCandidate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const candidate = entry as Record<string, unknown>;
    const type = normalizeEnum(candidate.type, VALID_ACTION_TYPES, null);
    const payload = normalizeString(candidate.payload);
    const rationale = normalizeString(candidate.rationale);
    if (!type || !payload) {
      return [];
    }

    return [
      {
        type,
        payload,
        ...(rationale ? { rationale } : {}),
      },
    ];
  });
}

function normalizeStringList(
  value: unknown,
  key?: string,
): string[] {
  const source =
    key && value && typeof value === "object"
      ? (value as Record<string, unknown>)[key]
      : value;

  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((entry) => normalizeString(entry))
    .filter(Boolean) as string[];
}

function normalizeEnumList<T extends string>(
  value: unknown,
  validValues: Set<T>,
): T[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const normalized = normalizeEnum(entry, validValues, null);
    return normalized ? [normalized] : [];
  });
}

function normalizeEnum<T extends string>(
  value: unknown,
  validValues: Set<T>,
  fallback: T | null,
): T | null {
  const normalized = normalizeString(value) as T;
  if (normalized && validValues.has(normalized)) {
    return normalized;
  }
  return fallback;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
