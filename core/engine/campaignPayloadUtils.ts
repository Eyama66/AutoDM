import type { ParsedAction } from "./ActionProcessor.js";
import type {
  CheckSetPayload,
  ParsedCheckPayload,
  ParsedKeyValuePayload,
} from "./campaignTypes.js";

export function parseKeyValuePayload(
  payload: string,
): ParsedKeyValuePayload | null {
  const separatorIndex = payload.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }

  const key = payload.slice(0, separatorIndex).trim();
  const value = payload.slice(separatorIndex + 1).trim();
  if (!key || !value) {
    return null;
  }

  return { key, value };
}

export function parseCheckPayload(
  payload: string,
): ParsedCheckPayload | null {
  const parts = payload
    .split(":")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  const [skill, dcRaw, ...reasonParts] = parts;
  const dc = Number(dcRaw);
  const reason = reasonParts.join(":").trim();

  if (!skill || !Number.isFinite(dc) || dc <= 0) {
    return null;
  }

  return { skill, dc, reason };
}

export function parseCheckSetPayload(
  payload: string,
): CheckSetPayload | null {
  try {
    const parsedPayload = JSON.parse(payload) as CheckSetPayload;

    if (
      !parsedPayload ||
      (parsedPayload.mode !== "choose_one" && parsedPayload.mode !== "all") ||
      typeof parsedPayload.label !== "string" ||
      parsedPayload.label.trim().length === 0 ||
      !Array.isArray(parsedPayload.checks) ||
      parsedPayload.checks.length === 0
    ) {
      return null;
    }

    const normalizedChecks = parsedPayload.checks.map((check) => ({
      skill: String(check?.skill || "").trim(),
      dc: Number(check?.dc),
      reason: String(check?.reason || "").trim(),
    }));

    if (
      normalizedChecks.some(
        (check) =>
          !check.skill ||
          !Number.isFinite(check.dc) ||
          check.dc <= 0 ||
          !check.reason,
      )
    ) {
      return null;
    }

    return {
      mode: parsedPayload.mode,
      label: parsedPayload.label.trim(),
      explanation:
        typeof parsedPayload.explanation === "string"
          ? parsedPayload.explanation.trim()
          : "",
      checks: normalizedChecks,
    };
  } catch {
    return null;
  }
}

export function parseListPayload(payload: string): string[] {
  return payload
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeRollFormula(formula: string): string {
  return formula
    .replace(/\s+/g, "")
    .replace(/你的/g, "")
    .replace(/调整值/g, "")
    .replace(/力量/gi, "STR")
    .replace(/敏捷/gi, "DEX")
    .replace(/体质/gi, "CON")
    .replace(/智力/gi, "INT")
    .replace(/感知/gi, "WIS")
    .replace(/魅力/gi, "CHA");
}

export function isValidVariableUpdate(payload: string): boolean {
  const parsedPayload = parseKeyValuePayload(payload);
  return (
    !!parsedPayload &&
    /^[A-Za-z0-9_\-\u4e00-\u9fa5]+$/.test(parsedPayload.key) &&
    parsedPayload.value.length > 0
  );
}

export function isValidFormulaRoll(payload: string): boolean {
  const parsedPayload = parseKeyValuePayload(payload);
  return (
    !!parsedPayload &&
    parsedPayload.key.length > 0 &&
    /^(\d+d\d+|[A-Za-z]+)([+-](\d+d\d+|\d+|[A-Za-z]+))*$/i.test(
      normalizeRollFormula(parsedPayload.value),
    )
  );
}

export function isValidCheckPayload(payload: string): boolean {
  const parsedPayload = parseCheckPayload(payload);
  return (
    !!parsedPayload &&
    parsedPayload.skill.length > 0 &&
    parsedPayload.dc > 0
  );
}

export function isValidCheckSetPayload(payload: string): boolean {
  return !!parseCheckSetPayload(payload);
}

export function isPlayerRollRequest(actionType: ParsedAction["type"]): boolean {
  return (
    actionType === "@CHECK" ||
    actionType === "@CHECK_SET" ||
    actionType === "@ROLL"
  );
}
