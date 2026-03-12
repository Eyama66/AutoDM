import type {
  CombatState,
  EngineState,
  SceneState,
  SessionMode,
} from "./EngineState.js";

export type ParticipantRole = "player" | "ai_dm" | "npc_agent" | "observer";

export type ConnectionState = "online" | "offline" | "reconnecting";

export interface ParticipantPermissions {
  canSubmitIntent: boolean;
  canControlCombat: boolean;
  canViewDmOnlyState: boolean;
}

export interface SessionParticipant {
  participantId: string;
  role: ParticipantRole;
  displayName: string;
  characterId?: string;
  connectionState: ConnectionState;
  permissions: ParticipantPermissions;
}

/**
 * SessionRecord 用于描述单人或多人跑团房间的最小权威包。
 */
export interface SessionRecord {
  sessionId: string;
  mode: SessionMode;
  moduleId: string;
  participants: SessionParticipant[];
  state: EngineState;
  activeSceneId?: string;
  activeScene?: SceneState;
  activeCombatId?: string;
  activeCombat?: CombatState;
  revision: number;
}
