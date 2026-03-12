import type { EngineState } from "../session/EngineState.js";

export type ContextBlockKind =
  | "scene_summary"
  | "campaign_summary"
  | "entity_memory"
  | "open_thread";

export interface ContextBlock {
  id: string;
  kind: ContextBlockKind;
  title: string;
  content: Record<string, unknown>;
  priority: number;
  tokenEstimate?: number;
}

export interface RecentTurnContext {
  turnId: string;
  role: "player" | "dm" | "system";
  content: string;
  source?: string;
}

export interface CurrentIntentContext {
  participantId?: string;
  visibleText: string;
  normalizedIntent?: string;
  privateNotes?: string;
}

export interface ContextTokenBudget {
  total: number;
  reservedForState: number;
  reservedForSummaries: number;
  reservedForRecentTurns: number;
  reservedForResponse: number;
}

/**
 * ContextPacket 是未来 Context Assembler 的标准输出。
 * 它定义了送给 AIDM 的最小、可调试、可缓存上下文切片。
 */
export interface ContextPacket {
  rulesPromptShort: string;
  authoritativeState: EngineState;
  activeSceneSummary?: ContextBlock | null;
  campaignSummary?: ContextBlock | null;
  openThreads: ContextBlock[];
  relevantEntityMemories: ContextBlock[];
  recentTurns: RecentTurnContext[];
  currentInput: CurrentIntentContext;
  tokenBudget?: ContextTokenBudget;
}
