export type CheckSetMode = "choose_one" | "all";

export interface CheckSetItem {
  skill: string;
  dc: number;
  reason: string;
}

export interface CheckSetPayload {
  mode: CheckSetMode;
  label: string;
  explanation?: string;
  checks: CheckSetItem[];
}

export interface ParsedKeyValuePayload {
  key: string;
  value: string;
}

export interface ParsedCheckPayload {
  skill: string;
  dc: number;
  reason: string;
}
