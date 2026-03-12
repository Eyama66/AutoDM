export type ProposalKind = "narrative" | "rules";

export type NarrativeProposalType = "NARRATE" | "NPC_SPEAK" | "HINT";

export type RulesProposalType =
  | "PROPOSE_CHECK"
  | "PROPOSE_SAVE"
  | "PROPOSE_MOVE"
  | "PROPOSE_COMBAT_START"
  | "PROPOSE_DAMAGE"
  | "PROPOSE_REWARD"
  | "PROPOSE_FLAG_CHANGE";

interface ProposalBase<
  TKind extends ProposalKind,
  TType extends string,
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  kind: TKind;
  type: TType;
  payload: TPayload;
  confidence?: number;
}

export type NarrativeProposal = ProposalBase<
  "narrative",
  NarrativeProposalType
>;

export type RulesProposal = ProposalBase<"rules", RulesProposalType>;

export type AIProposal = NarrativeProposal | RulesProposal;

export interface AIResponseEnvelope {
  rawText: string;
  proposals: AIProposal[];
}
