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
}

export type GameState = EngineState;
