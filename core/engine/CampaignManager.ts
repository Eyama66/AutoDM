import { ActionProcessor } from "./ActionProcessor.js";
import type { ParsedAction } from "./ActionProcessor.js";
import type { CharacterSheet } from "../schemas/CharacterSheet.js";
import type { EngineState } from "../session/EngineState.js";
import { CombatEngine } from "./CombatEngine.js";
import { CharacterManager } from "./CharacterManager.js";
import { applyCampaignAction } from "./campaignActionEffects.js";
import type { CampaignEventFactory } from "./campaignActionEffects.js";
import { hasMonsterDefinition } from "./campaignMonsterUtils.js";
import {
  isPlayerRollRequest,
  isValidCheckPayload,
  isValidCheckSetPayload,
  isValidFormulaRoll,
  isValidVariableUpdate,
  parseListPayload,
} from "./campaignPayloadUtils.js";
import {
  getConnectivityMap,
  isRescueWindowOpen,
  normalizeInitialState,
} from "./campaignStateUtils.js";
import type { EventSource, KnownEngineEvent } from "../session/EngineEvent.js";

export type { EngineState } from "../session/EngineState.js";
export type GameState = EngineState;

export interface ProcessAiResponseResult {
  cleanText: string;
  validatedActions: ParsedAction[];
  emittedEvents: KnownEngineEvent[];
}

/**
 * CampaignManager: 战役总管
 * 它是整个 AutoDM 的“合龙点”，连接剧本数据、逻辑裁判与玩家状态。
 */
export class CampaignManager {
  private state: EngineState;
  private currentAreaData: any;
  private manifest: any;
  private combatEngine: CombatEngine;
  private eventSequence: number = 0;

  constructor(initialState: EngineState) {
    this.state = normalizeInitialState(initialState);
    this.combatEngine = new CombatEngine();
  }

  private isRescueWindowOpen(): boolean {
    return isRescueWindowOpen(this.state);
  }

  /**
   * 初始化战役：加载剧本清单与起始区域
   */
  initialize(manifest: any, areaData: any) {
    this.manifest = manifest;
    this.currentAreaData = areaData;

    // 如果 state 里的 variables 是空的，则尝试从 manifest 初始化
    if (!this.state.variables) {
      this.state.variables = manifest.globalVariables || {};
    } else {
      // 增量合并新剧本可能定义的变量，但不覆盖已有状态
      this.state.variables = {
        ...(manifest.globalVariables || {}),
        ...this.state.variables,
      };
    }

    console.log(`[Campaign] 初始化成功：${this.manifest.name}`);
  }

  /**
   * 核心处理流程：处理 AI 输出并更新世界状态
   */
  processAiResponse(rawText: string): ProcessAiResponseResult {
    // 1. 提取动作
    const rawActions = ActionProcessor.parse(rawText);
    const validatedActions: ParsedAction[] = [];
    const emittedEvents: KnownEngineEvent[] = [
      this.createEvent("AI_PROPOSAL_RECEIVED", {
        rawText,
        proposalCount: rawActions.length,
      }, "ai_dm"),
    ];
    let hasPendingPlayerRollRequest = false;

    // 2. 逻辑笼子：逐一校验动作合法性
    for (const action of rawActions) {
      if (this.state.phase === "completed" && action.type !== "@SESSION_END") {
        console.warn(`[Campaign] 已完成的会话忽略后续动作: ${action.originalTag}`);
        continue;
      }

      if (
        isPlayerRollRequest(action.type) &&
        hasPendingPlayerRollRequest
      ) {
        console.warn(
          `[Campaign] 拦截到重复的玩家侧掷骰请求: ${action.originalTag}`,
        );
        continue;
      }

      const isValid = this.validateAction(action);
      if (isValid) {
        emittedEvents.push(...this.applyAction(action));
        validatedActions.push(action);
        if (isPlayerRollRequest(action.type)) {
          hasPendingPlayerRollRequest = true;
        }
      } else {
        console.warn(`[Campaign] 拦截到非法 AI 动作: ${action.originalTag}`);
      }
    }

    // 3. 清理叙事文本
    const cleanText = ActionProcessor.cleanText(rawText);
    let finalActions = validatedActions;
    if (this.state.phase === "completed") {
      finalActions = validatedActions.filter(
        (action) =>
          action.type !== "@CHECK" &&
          action.type !== "@CHECK_SET" &&
          action.type !== "@ROLL" &&
          action.type !== "@SESSION_END",
      );
    } else if (
      CharacterManager.isDowned(this.state.characterSheet) &&
      !this.isRescueWindowOpen()
    ) {
      finalActions = validatedActions.filter(
        (action) => action.type !== "@CHECK" && action.type !== "@CHECK_SET",
      );
    }

    return { cleanText, validatedActions: finalActions, emittedEvents };
  }

  /**
   * 动作校验逻辑 (The Guard)
   */
  private validateAction(action: ParsedAction): boolean {
    switch (action.type) {
      case "@MOVE":
        // 校验地理连通性
        const connectivity = getConnectivityMap(this.currentAreaData);
        return ActionProcessor.validateMove(
          this.state.currentLocationId,
          action.payload,
          connectivity,
        );

      case "@ATTR_UPDATE":
        // 简单的格式校验 e.g. "HP:-5"
        return /^[A-Z]+:[-+]?\d+$/.test(action.payload.trim());

      case "@CHECK":
        // 校验格式: "Skill:DC"
        return (
          (CharacterManager.canTakeNormalAction(this.state.characterSheet) ||
            this.isRescueWindowOpen()) &&
          isValidCheckPayload(action.payload)
        );

      case "@CHECK_SET":
        return (
          (CharacterManager.canTakeNormalAction(this.state.characterSheet) ||
            this.isRescueWindowOpen()) &&
          isValidCheckSetPayload(action.payload)
        );

      case "@ROLL":
        if (this.state.phase === "completed") {
          return false;
        }
        return isValidFormulaRoll(action.payload);

      case "@SESSION_END":
        return action.payload.trim().length > 0;

      case "@PLOT_UPDATE":
        return (
          action.payload.trim().length > 0 &&
          !this.state.plotProgress.includes(action.payload.trim())
        );

      case "@VAR_UPDATE":
        return isValidVariableUpdate(action.payload);

      case "@INIT_COMBAT":
      case "@COMBAT_START":
        return parseListPayload(action.payload).every((id) =>
          hasMonsterDefinition(this.monsterLibrary, id),
        );

      case "@ITEM_ADD": {
        const itemName = action.payload.trim();
        if (!itemName) return false;
        const location = this.currentAreaData?.locations?.find(
          (l: any) => l.id === this.state.currentLocationId,
        );
        const allowedItems: string[] = location?.items || [];
        return allowedItems.some(
          (allowed: string) => allowed.toLowerCase() === itemName.toLowerCase(),
        );
      }

      case "@COMBAT_END":
        return this.state.isCombatActive;

      case "@NARRATE":
        return true;

      default:
        // 未实现的标签不应静默通过
        return false;
    }
  }

  /**
   * 状态应用逻辑 (The Mutator)
   */
  private applyAction(action: ParsedAction): KnownEngineEvent[] {
    return applyCampaignAction({
      action,
      state: this.state,
      combatEngine: this.combatEngine,
      monsterLibrary: this.monsterLibrary,
      loadArea: (areaId) => this.loadArea(areaId),
      buildCombatId: () => this.buildCombatId(),
      createEvent: this.createEvent.bind(this) as CampaignEventFactory,
    });
  }

  private onAreaLoad?: (areaId: string) => void;
  private monsterLibrary: any[] = [];

  setCallbacks(areaLoader: (areaId: string) => void) {
    this.onAreaLoad = areaLoader;
  }

  setMonsterLibrary(monsters: any[]) {
    this.monsterLibrary = monsters;
  }

  private loadArea(areaId: string) {
    if (this.onAreaLoad) this.onAreaLoad(areaId);
  }

  setCharacter(char: CharacterSheet) {
    this.state.characterSheet = char;
    if (this.state.sessionMode === "solo" || this.state.party.length === 0) {
      this.state.party = [char];
      return;
    }

    this.state.party = [char, ...this.state.party.slice(1)];
  }

  syncCombatState() {
    this.state.isCombatActive = this.combatEngine.getCombatStatus();
  }

  replaceState(nextState: EngineState) {
    this.state = normalizeInitialState(nextState);
    this.combatEngine = new CombatEngine();
  }

  getCurrentAreaData() {
    return this.currentAreaData;
  }

  getCombatEngine() {
    return this.combatEngine;
  }

  getState(): EngineState {
    return this.state;
  }

  private buildCombatId(): string {
    return `combat_${Date.now()}_${this.eventSequence + 1}`;
  }

  private createEvent<TType extends KnownEngineEvent["type"]>(
    type: TType,
    payload: Extract<KnownEngineEvent, { type: TType }>["payload"],
    source: EventSource = "engine",
  ): Extract<KnownEngineEvent, { type: TType }> {
    this.eventSequence += 1;

    return {
      id: `evt_${Date.now()}_${this.eventSequence}`,
      type,
      payload,
      meta: {
        source,
        createdAt: new Date().toISOString(),
      },
    } as Extract<KnownEngineEvent, { type: TType }>;
  }
}
