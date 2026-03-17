import type { PromptContext } from "../ai/promptBuilder.js";
import type { ParsedAction } from "../engine/ActionProcessor.js";
import type { EngineState } from "../session/EngineState.js";

const GLOBAL_TRACE_FLAG = "__AUTODM_TRACE__";
const DISABLED_VALUES = new Set(["0", "false", "off", "no"]);

function readEnvTraceFlag(): boolean {
  const env = (import.meta as any)?.env;
  const explicit = env?.VITE_AUTODM_TRACE;

  if (typeof explicit === "string" && explicit.trim() !== "") {
    return !DISABLED_VALUES.has(explicit.trim().toLowerCase());
  }

  return env?.DEV === true;
}

export function isTraceEnabled(): boolean {
  if (
    typeof globalThis !== "undefined" &&
    typeof (globalThis as any)[GLOBAL_TRACE_FLAG] === "boolean"
  ) {
    return Boolean((globalThis as any)[GLOBAL_TRACE_FLAG]);
  }

  return readEnvTraceFlag();
}

export function setTraceEnabled(enabled: boolean): void {
  if (typeof globalThis !== "undefined") {
    (globalThis as any)[GLOBAL_TRACE_FLAG] = enabled;
  }
}

export function trace(scope: string, message: string, data?: unknown): void {
  if (!isTraceEnabled()) {
    return;
  }

  if (typeof data === "undefined") {
    console.log(`[Trace:${scope}] ${message}`);
    return;
  }

  console.log(`[Trace:${scope}] ${message}`, data);
}

export function traceWarn(scope: string, message: string, data?: unknown): void {
  if (!isTraceEnabled()) {
    return;
  }

  if (typeof data === "undefined") {
    console.warn(`[Trace:${scope}] ${message}`);
    return;
  }

  console.warn(`[Trace:${scope}] ${message}`, data);
}

export function traceError(scope: string, message: string, data?: unknown): void {
  if (!isTraceEnabled()) {
    return;
  }

  if (typeof data === "undefined") {
    console.error(`[Trace:${scope}] ${message}`);
    return;
  }

  console.error(`[Trace:${scope}] ${message}`, data);
}

export function truncateForTrace(value: unknown, maxLength = 280): string {
  const raw = String(value || "");
  if (raw.length <= maxLength) {
    return raw;
  }

  return `${raw.slice(0, maxLength)}…`;
}

export function summarizeStateForTrace(state: EngineState | null | undefined) {
  if (!state) {
    return null;
  }

  const activeTrigger = state.triggerRuntime?.activeTrigger;

  return {
    module: state.currentModule,
    areaId: state.currentAreaId,
    locationId: state.currentLocationId,
    phase: state.phase,
    combat: state.isCombatActive,
    plotProgress: Array.isArray(state.plotProgress) ? [...state.plotProgress] : [],
    flags: Object.keys(state.variables || {}).filter((key) => Boolean((state.variables || {})[key])),
    activeTrigger: activeTrigger
      ? {
          triggerId: activeTrigger.triggerId,
          branch: activeTrigger.branch,
          deployable: {
            encounterIds: activeTrigger.deployable?.encounterIds || [],
            plotNodeIds: activeTrigger.deployable?.plotNodeIds || [],
            itemIds: activeTrigger.deployable?.itemIds || [],
          },
        }
      : null,
    resolvedChecks: state.resolutionRuntime?.resolvedChecks || [],
    claimedItemsBySceneId: state.sceneRuntime?.claimedItemsBySceneId || {},
  };
}

export function summarizePromptContextForTrace(context: PromptContext | null | undefined) {
  if (!context) {
    return null;
  }

  return {
    area: context.currentAreaName,
    location: context.currentLocationName,
    exits: (context.availableExitOptions || []).map((exit) => ({
      id: exit.id,
      name: exit.name,
    })),
    actions: context.currentLocationActions || [],
    encounters: context.currentLocationEncounters || [],
    items: context.currentLocationItems || [],
    allowedNpcSpeakers: context.allowedNpcSpeakerNames || [],
    knownLocationNames: context.knownLocationNames || [],
    plotFrontier: context.plotFrontier
      ? {
          active: context.plotFrontier.activeNodeIds,
          allowedNext: context.plotFrontier.allowedNodeIds,
          completed: context.plotFrontier.completedNodeIds,
        }
      : null,
    possibilitySpace: context.possibilitySpace
      ? {
          deployableEncounters: context.possibilitySpace.deployableEncounters.map((entry) => entry.id),
          advancablePlotNodes: context.possibilitySpace.advancablePlotNodes.map((entry) => entry.id),
          discoverableItems: context.possibilitySpace.discoverableItems,
          presentNpcs: context.possibilitySpace.presentNpcs.map((entry) => entry.name),
          activeTrigger: context.possibilitySpace.activeTrigger || null,
        }
      : null,
  };
}

export function summarizeActionsForTrace(actions: ParsedAction[] | null | undefined) {
  if (!Array.isArray(actions)) {
    return [];
  }

  return actions.map((action) => ({
    type: action.type,
    payload: action.payload,
    tag: action.originalTag,
  }));
}
