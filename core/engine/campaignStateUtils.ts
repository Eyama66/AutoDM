import { CharacterManager } from "./CharacterManager.js";
import type { EngineState } from "../session/EngineState.js";

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

export function getConnectivityMap(currentAreaData: any): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  if (currentAreaData && currentAreaData.locations) {
    currentAreaData.locations.forEach((location: any) => {
      map[location.id] = location.connections || [];
    });
  }
  return map;
}
