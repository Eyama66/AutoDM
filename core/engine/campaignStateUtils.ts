import { CharacterManager } from "./CharacterManager.js";
import type {
  EngineState,
  ResolvedCheckScope,
} from "../session/EngineState.js";

export function normalizeInitialState(initialState: EngineState): EngineState {
  const party =
    Array.isArray(initialState.party) && initialState.party.length > 0
      ? initialState.party
      : [initialState.characterSheet];

  return {
    ...initialState,
    party,
    activeQuestIds: Array.isArray(initialState.activeQuestIds)
      ? initialState.activeQuestIds
      : [],
    sessionMode: initialState.sessionMode === "party" ? "party" : "solo",
    phase:
      initialState.phase ||
      (CharacterManager.isDowned(initialState.characterSheet)
        ? "endgame"
        : initialState.isCombatActive
          ? "combat"
          : "exploration"),
    activeScene: initialState.activeScene || {
      sceneId: `${initialState.currentAreaId}:${initialState.currentLocationId}`,
      areaId: initialState.currentAreaId,
      locationId: initialState.currentLocationId,
      tags: [],
    },
    sceneRuntime: {
      claimedItemsBySceneId:
        initialState.sceneRuntime?.claimedItemsBySceneId || {},
    },
    triggerRuntime: {
      activeTrigger: initialState.triggerRuntime?.activeTrigger || null,
    },
    resolutionRuntime: {
      resolvedChecks: Array.isArray(initialState.resolutionRuntime?.resolvedChecks)
        ? initialState.resolutionRuntime?.resolvedChecks
        : [],
    },
    variables: {
      last_chance_available: false,
      ...(initialState.variables || {}),
    },
  };
}

export function isRescueWindowOpen(state: EngineState): boolean {
  return (
    CharacterManager.isDowned(state.characterSheet) &&
    state.variables.last_chance_available === true
  );
}

export function buildActiveScene(
  state: EngineState,
): NonNullable<EngineState["activeScene"]> {
  return {
    sceneId: `${state.currentAreaId}:${state.currentLocationId}`,
    areaId: state.currentAreaId,
    locationId: state.currentLocationId,
    tags: state.activeScene?.tags || [],
  };
}

export function getCurrentSceneId(state: EngineState): string {
  return `${state.currentAreaId}:${state.currentLocationId}`;
}

export function getClaimedSceneItems(
  state: EngineState,
  sceneId: string = getCurrentSceneId(state),
): string[] {
  return state.sceneRuntime?.claimedItemsBySceneId?.[sceneId] || [];
}

export function hasClaimedSceneItem(
  state: EngineState,
  itemName: string,
  sceneId: string = getCurrentSceneId(state),
): boolean {
  const normalizedItemName = String(itemName || "").trim().toLowerCase();
  if (!normalizedItemName) {
    return false;
  }

  return getClaimedSceneItems(state, sceneId).some(
    (claimedItem) => claimedItem.trim().toLowerCase() === normalizedItemName,
  );
}

export function markSceneItemClaimed(
  state: EngineState,
  itemName: string,
  sceneId: string = getCurrentSceneId(state),
): void {
  const normalizedItemName = String(itemName || "").trim();
  if (!normalizedItemName) {
    return;
  }

  if (!state.sceneRuntime) {
    state.sceneRuntime = { claimedItemsBySceneId: {} };
  }

  if (!state.sceneRuntime.claimedItemsBySceneId) {
    state.sceneRuntime.claimedItemsBySceneId = {};
  }

  if (hasClaimedSceneItem(state, normalizedItemName, sceneId)) {
    return;
  }

  const currentSceneClaims = getClaimedSceneItems(state, sceneId);
  state.sceneRuntime.claimedItemsBySceneId[sceneId] = [
    ...currentSceneClaims,
    normalizedItemName,
  ];
}

export function clearActiveTrigger(state: EngineState): void {
  if (state.triggerRuntime?.activeTrigger) {
    state.triggerRuntime.activeTrigger = null;
  }
}

function normalizeScopeText(value: string): string {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildResolvedCheckScope(
  state: EngineState,
  input: {
    skill: string;
    dc: number;
    reason?: string | undefined;
    intent?: string | undefined;
  },
): ResolvedCheckScope {
  return {
    sceneId: getCurrentSceneId(state),
    skill: normalizeScopeText(input.skill),
    dc: Number(input.dc),
    reasonKey: normalizeScopeText(input.reason || ""),
    intentKey: normalizeScopeText(input.intent || ""),
  };
}

export function getResolvedCheckScopes(state: EngineState): ResolvedCheckScope[] {
  return state.resolutionRuntime?.resolvedChecks || [];
}

export function hasResolvedCheckScope(
  state: EngineState,
  candidate: ResolvedCheckScope,
  options?: { allowSkillDcFallback?: boolean },
): boolean {
  const candidateReason = normalizeScopeText(candidate.reasonKey || "");
  const candidateIntent = normalizeScopeText(candidate.intentKey || "");

  return getResolvedCheckScopes(state).some((entry) => {
    if (
      entry.sceneId !== candidate.sceneId ||
      normalizeScopeText(entry.skill) !== candidate.skill ||
      Number(entry.dc) !== Number(candidate.dc)
    ) {
      return false;
    }

    const entryReason = normalizeScopeText(entry.reasonKey || "");
    const entryIntent = normalizeScopeText(entry.intentKey || "");

    if (candidateReason && entryReason && candidateReason === entryReason) {
      return true;
    }

    if (candidateIntent && entryIntent && candidateIntent === entryIntent) {
      return true;
    }

    if (options?.allowSkillDcFallback) {
      return true;
    }

    return false;
  });
}

export function markResolvedCheckScope(
  state: EngineState,
  candidate: ResolvedCheckScope,
): void {
  if (!state.resolutionRuntime) {
    state.resolutionRuntime = { resolvedChecks: [] };
  }

  if (
    hasResolvedCheckScope(state, candidate, {
      allowSkillDcFallback: false,
    })
  ) {
    return;
  }

  state.resolutionRuntime.resolvedChecks = [
    ...getResolvedCheckScopes(state),
    candidate,
  ];
}

export function clearResolvedCheckScopes(state: EngineState): void {
  if (!state.resolutionRuntime) {
    state.resolutionRuntime = { resolvedChecks: [] };
    return;
  }

  state.resolutionRuntime.resolvedChecks = [];
}

export function getConnectivityMap(currentAreaData: any): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  if (currentAreaData && currentAreaData.locations) {
    currentAreaData.locations.forEach((location: any) => {
      map[location.id] = location.connections || [];
    });
  }
  return map;
}
