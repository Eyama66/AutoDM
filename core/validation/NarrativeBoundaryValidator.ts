import { ActionProcessor } from "../engine/ActionProcessor.js";
import { parseListPayload } from "../engine/campaignPayloadUtils.js";
import { buildPlotFrontier } from "../engine/campaignPlotUtils.js";
import type { PromptContext } from "../ai/promptBuilder.js";

export interface NarrativeBoundaryViolation {
  code: string;
  message: string;
}

export interface NarrativeBoundaryResult {
  valid: boolean;
  violations: NarrativeBoundaryViolation[];
}

const NPC_SPEAKER_REGEX = /<<NPC:\s*([^>]+?)>>/g;
const ARRIVAL_VERBS = [
  "来到",
  "进入",
  "踏入",
  "抵达",
  "走进",
  "走到",
  "置身于",
  "身处",
  "站在",
  "踏进",
];

export function validateNarrativeBoundaries(
  rawText: string,
  context: PromptContext,
): NarrativeBoundaryResult {
  const violations: NarrativeBoundaryViolation[] = [];
  const parsedActions = ActionProcessor.parse(rawText);
  const allowedSpeakerNames = new Set(
    [
      ...(context.allowedNpcSpeakerNames || []),
      ...(context.npcs || []).map((npc) => String(npc?.name || "").trim()),
    ]
      .map((name) => String(name || "").trim())
      .filter(Boolean),
  );

  const invalidSpeakers = extractNpcSpeakers(rawText).filter(
    (speaker) => !allowedSpeakerNames.has(speaker),
  );
  if (invalidSpeakers.length > 0) {
    violations.push({
      code: "npc_speaker_out_of_scene",
      message: `以下 NPC 不在当前场景白名单中：${invalidSpeakers.join("、")}`,
    });
  }

  const invalidArrivalLocations = findInvalidArrivalLocations(rawText, context);
  if (invalidArrivalLocations.length > 0) {
    violations.push({
      code: "location_scene_drift",
      message: `叙事把玩家带到了当前不可达地点：${invalidArrivalLocations.join("、")}`,
    });
  }

  const illegalActionViolations = validateNarrativeActions(parsedActions, context);
  violations.push(...illegalActionViolations);

  return {
    valid: violations.length === 0,
    violations,
  };
}

export function buildNarrativeCorrectionPrompt(
  result: NarrativeBoundaryResult,
): string {
  if (result.valid) {
    return "";
  }

  return [
    "[SYSTEM_BOUNDARY_CORRECTION]",
    "你的上一条回复越过了当前剧本边界。",
    ...result.violations.map((violation, index) => `${index + 1}. ${violation.message}`),
    "请仅基于当前 CTX_PACKET 重写整条回复。",
    "你必须先裁定玩家意图是否成立，再叙事；不要把玩家愿望直接写成既成事实。",
    "必须保持世界内表达，不要解释系统、校验器或幕后规则。",
    "保留叙事张力，但不要引入不在当前场景/剧情白名单中的 NPC、地点、出口或事实。",
  ].join("\n");
}

function extractNpcSpeakers(rawText: string): string[] {
  const matches = new Set<string>();
  let match: RegExpExecArray | null = null;
  NPC_SPEAKER_REGEX.lastIndex = 0;

  while ((match = NPC_SPEAKER_REGEX.exec(rawText)) !== null) {
    const speaker = String(match[1] || "").trim();
    if (speaker) {
      matches.add(speaker);
    }
  }

  return Array.from(matches);
}

function findInvalidArrivalLocations(
  rawText: string,
  context: PromptContext,
): string[] {
  const allowedArrivalLocations = new Set(
    [
      context.currentLocationName,
      ...(context.availableExitOptions || []).map((exit) => exit?.name || ""),
    ]
      .map((name) => String(name || "").trim())
      .filter(Boolean),
  );

  const knownLocationNames = Array.isArray(context.knownLocationNames)
    ? context.knownLocationNames
    : [];

  return knownLocationNames.filter((locationName) => {
    const normalizedName = String(locationName || "").trim();
    if (!normalizedName || allowedArrivalLocations.has(normalizedName)) {
      return false;
    }

    return isLocationPresentedAsCurrentScene(rawText, normalizedName);
  });
}

function isLocationPresentedAsCurrentScene(
  rawText: string,
  locationName: string,
): boolean {
  if (!rawText.includes(locationName)) {
    return false;
  }

  return ARRIVAL_VERBS.some((verb) => {
    const regex = new RegExp(`${verb}[^。！？\\n]{0,8}${escapeRegExp(locationName)}`);
    return regex.test(rawText);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateNarrativeActions(
  actions: ReturnType<typeof ActionProcessor.parse>,
  context: PromptContext,
): NarrativeBoundaryViolation[] {
  const violations: NarrativeBoundaryViolation[] = [];
  const allowedMoveTargets = new Set(
    [
      ...(context.availableExitOptions || []).map((exit) => exit?.id || ""),
      ...(context.availableConnections || []),
    ]
      .map((entry) => String(entry || "").trim())
      .filter(Boolean),
  );
  const allowedItems = new Set(
    (context.possibilitySpace?.discoverableItems ?? context.currentLocationItems ?? [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  );
  const allowedEncounterIds = (context.possibilitySpace?.deployableEncounters ?? context.currentLocationEncounters ?? [])
    .map((entry) => String(typeof entry === "object" ? (entry as any).id : entry || "").trim())
    .filter(Boolean);
  const allowedEncounterSet = new Set(allowedEncounterIds);
  const allowedPlotUpdates = context.possibilitySpace
    ? new Set(context.possibilitySpace.advancablePlotNodes.map((n) => n.id))
    : new Set(
        (context.plotFrontier || buildPlotFrontier(context.modulePlot, context.playerState?.plotProgress))
          .allowedNodeIds,
      );

  for (const action of actions) {
    const payload = String(action.payload || "").trim();

    if (action.type === "@MOVE" && payload && !allowedMoveTargets.has(payload)) {
      violations.push({
        code: "move_out_of_scene",
        message: `移动标签越过了当前 scene.exits 白名单：${payload}`,
      });
      continue;
    }

    if (action.type === "@ITEM_ADD" && payload && !allowedItems.has(payload)) {
      violations.push({
        code: "item_out_of_scene",
        message: `给予了当前地点白名单之外的物品：${payload}`,
      });
      continue;
    }

    if (
      (action.type === "@COMBAT_START" || action.type === "@INIT_COMBAT") &&
      payload
    ) {
      if (allowedEncounterIds.length === 0) {
        violations.push({
          code: "combat_out_of_scene",
          message: `当前 scene.encounters 为空，不允许发起战斗：${payload}`,
        });
        continue;
      }

      const invalidEncounterIds = parseListPayload(payload).filter(
        (encounterId) => !allowedEncounterSet.has(encounterId),
      );
      if (invalidEncounterIds.length > 0) {
        violations.push({
          code: "combat_out_of_scene",
          message: `战斗标签引用了当前场景之外的 encounter：${invalidEncounterIds.join("、")}`,
        });
      }
      continue;
    }

    if (
      action.type === "@PLOT_UPDATE" &&
      payload &&
      !allowedPlotUpdates.has(payload)
    ) {
      violations.push({
        code: "plot_out_of_frontier",
        message: `剧情推进越过了当前允许的 plot frontier：${payload}`,
      });
    }
  }

  return violations;
}
