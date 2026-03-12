export type EventSource = "player" | "ai_dm" | "system" | "engine";

export interface EngineEventMeta {
  source: EventSource;
  createdAt: string;
  participantId?: string;
  correlationId?: string;
}

export interface CheckDefinition {
  skill: string;
  dc: number;
  reason?: string;
}

export interface EngineEvent<
  TType extends string = string,
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  type: TType;
  payload: TPayload;
  meta: EngineEventMeta;
}

export type PlayerIntentSubmittedEvent = EngineEvent<
  "PLAYER_INTENT_SUBMITTED",
  {
    intent: string;
    visibleText: string;
    participantId: string;
  }
>;

export type AIProposalReceivedEvent = EngineEvent<
  "AI_PROPOSAL_RECEIVED",
  {
    rawText: string;
    proposalCount: number;
  }
>;

export type CheckRequestedEvent = EngineEvent<
  "CHECK_REQUESTED",
  {
    mode: "single" | "choose_one" | "all";
    label?: string;
    explanation?: string;
    checks: CheckDefinition[];
  }
>;

export type RollRequestedEvent = EngineEvent<
  "ROLL_REQUESTED",
  {
    label: string;
    formula: string;
  }
>;

export type RollResolvedEvent = EngineEvent<
  "ROLL_RESOLVED",
  {
    label: string;
    formula?: string;
    total: number;
    breakdown: string;
    outcome?: "success" | "failure";
  }
>;

export type AttributeUpdatedEvent = EngineEvent<
  "ATTRIBUTE_UPDATED",
  {
    attribute: string;
    previousValue: number | null;
    newValue: number | null;
    delta: number;
  }
>;

export type VariableUpdatedEvent = EngineEvent<
  "VARIABLE_UPDATED",
  {
    key: string;
    previousValue?: unknown;
    newValue: unknown;
  }
>;

export type PlotUpdatedEvent = EngineEvent<
  "PLOT_UPDATED",
  {
    plotPointId: string;
  }
>;

export type MoveResolvedEvent = EngineEvent<
  "MOVE_RESOLVED",
  {
    fromAreaId: string;
    fromLocationId: string;
    toAreaId: string;
    toLocationId: string;
  }
>;

export type DamageAppliedEvent = EngineEvent<
  "DAMAGE_APPLIED",
  {
    targetId: string;
    amount: number;
    damageType?: string;
    sourceId?: string;
  }
>;

export type CombatStartedEvent = EngineEvent<
  "COMBAT_STARTED",
  {
    combatId: string;
    participantIds: string[];
    encounterIds: string[];
  }
>;

export type CombatEndedEvent = EngineEvent<
  "COMBAT_ENDED",
  {
    combatId?: string;
  }
>;

export type QuestUpdatedEvent = EngineEvent<
  "QUEST_UPDATED",
  {
    questId: string;
    status: "active" | "completed" | "failed";
    note?: string;
  }
>;

export type SummaryGeneratedEvent = EngineEvent<
  "SUMMARY_GENERATED",
  {
    summaryId: string;
    summaryKind: "scene_summary" | "campaign_summary" | "entity_memory";
    sourceRevision: number;
  }
>;

export type SessionEndedEvent = EngineEvent<
  "SESSION_ENDED",
  {
    reason: string;
    finalPhase: "completed";
  }
>;

export type KnownEngineEvent =
  | PlayerIntentSubmittedEvent
  | AIProposalReceivedEvent
  | CheckRequestedEvent
  | RollRequestedEvent
  | RollResolvedEvent
  | AttributeUpdatedEvent
  | VariableUpdatedEvent
  | PlotUpdatedEvent
  | MoveResolvedEvent
  | DamageAppliedEvent
  | CombatStartedEvent
  | CombatEndedEvent
  | QuestUpdatedEvent
  | SummaryGeneratedEvent
  | SessionEndedEvent;
