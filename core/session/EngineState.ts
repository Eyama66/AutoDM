import type { CharacterSheet } from "../schemas/CharacterSheet.js";

export type SessionMode = "solo" | "party";

export type SessionPhase =
  | "setup"
  | "exploration"
  | "dialogue"
  | "check_pending"
  | "combat"
  | "endgame"
  | "resolution"
  | "paused"
  | "completed";

export type WorldVariables = Record<string, unknown>;

export interface SceneState {
  sceneId: string;
  areaId: string;
  locationId: string;
  tags: string[];
}

export interface CombatState {
  combatId: string;
  activeEncounterId?: string;
  initiativeOrder: string[];
  activeTurnParticipantId?: string;
}

export interface SceneRuntimeState {
  claimedItemsBySceneId: Record<string, string[]>;
}

export interface ActiveTriggerDeployable {
  encounterIds?: string[];
  plotNodeIds?: string[];
  itemIds?: string[];
}

export interface ActiveTriggerState {
  triggerId: string;
  branch: "success" | "failure" | string;
  narrativeHint: string;
  deployable: ActiveTriggerDeployable;
}

export interface TriggerRuntimeState {
  activeTrigger: ActiveTriggerState | null;
}

export interface ResolvedCheckScope {
  sceneId: string;
  skill: string;
  dc: number;
  reasonKey?: string;
  intentKey?: string;
}

export interface ResolutionRuntimeState {
  resolvedChecks: ResolvedCheckScope[];
}

/**
 * EngineState 是 AutoDM 未来的权威状态快照。
 * 现阶段保留 legacy 字段以兼容当前单人浏览器版本。
 */
export interface EngineState {
  currentModule: string;
  currentAreaId: string;
  currentLocationId: string;
  characterSheet: CharacterSheet;
  party: CharacterSheet[];
  plotProgress: string[];
  activeQuestIds: string[];
  isCombatActive: boolean;
  variables: WorldVariables;
  sessionMode: SessionMode;
  phase: SessionPhase;
  activeScene?: SceneState;
  combat?: CombatState;
  sceneRuntime?: SceneRuntimeState;
  triggerRuntime?: TriggerRuntimeState;
  resolutionRuntime?: ResolutionRuntimeState;
}

export type GameState = EngineState;
