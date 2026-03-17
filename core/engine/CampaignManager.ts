import { ActionProcessor } from "./ActionProcessor.js";
import type { ParsedAction } from "./ActionProcessor.js";
import type { CharacterSheet } from "../schemas/CharacterSheet.js";
import type { EngineState } from "../session/EngineState.js";
import { CombatEngine } from "./CombatEngine.js";
import { CharacterManager } from "./CharacterManager.js";
import { applyCampaignAction } from "./campaignActionEffects.js";
import type { CampaignEventFactory } from "./campaignActionEffects.js";
import {
  getSceneAuthority,
  type ModuleAuthority,
} from "./campaignAuthority.js";
import type { ActiveTriggerState } from "../session/EngineState.js";
import {
  parseCheckPayload,
  parseCheckSetPayload,
  isPlayerRollRequest,
  isValidCheckPayload,
  isValidCheckSetPayload,
  isValidFormulaRoll,
  isValidVariableUpdate,
  parseListPayload,
} from "./campaignPayloadUtils.js";
import {
  isPlotUpdateAllowed,
  type ModulePlotLike,
} from "./campaignPlotUtils.js";
import {
  buildResolvedCheckScope,
  clearResolvedCheckScopes,
  clearActiveTrigger,
  hasResolvedCheckScope,
  hasClaimedSceneItem,
  isRescueWindowOpen,
  markResolvedCheckScope,
  normalizeInitialState,
} from "./campaignStateUtils.js";
import type { EventSource, KnownEngineEvent } from "../session/EngineEvent.js";
import {
  summarizeActionsForTrace,
  summarizeStateForTrace,
  trace,
  traceWarn,
} from "../debug/traceLogger.js";

export type { EngineState } from "../session/EngineState.js";
export type GameState = EngineState;

export interface ProcessAiResponseResult {
  cleanText: string;
  validatedActions: ParsedAction[];
  rejectedActions: RejectedAiAction[];
  emittedEvents: KnownEngineEvent[];
}

export type ActionRejectionReason =
  | "duplicate_resolved_check"
  | "check_not_allowed_in_scene"
  | "invalid_check_payload"
  | "blocked_by_state"
  | "generic_invalid";

export interface RejectedAiAction {
  action: ParsedAction;
  reason: ActionRejectionReason;
}

/**
 * CampaignManager: 战役总管
 * 它是整个 AutoDM 的“合龙点”，连接剧本数据、逻辑裁判与玩家状态。
 */
export class CampaignManager {
  private state: EngineState;
  private currentAreaData: any;
  private manifest: any;
  private modulePlotData: ModulePlotLike | null = null;
  private moduleAuthority: ModuleAuthority | null = null;
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
  initialize(manifest: any, areaData: any, modulePlotData?: ModulePlotLike | null) {
    this.manifest = manifest;
    this.currentAreaData = areaData;
    this.modulePlotData = modulePlotData || this.modulePlotData || null;

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
    trace("campaign.init", "campaign initialized", {
      manifest: {
        id: this.manifest?.moduleId || this.manifest?.id || this.manifest?.name,
        name: this.manifest?.name,
      },
      state: summarizeStateForTrace(this.state),
      sceneAuthority: this.getCurrentSceneAuthority()
        ? {
            exits: this.getCurrentSceneAuthority()?.exits?.map((entry) => entry.ref) || [],
            encounters: this.getCurrentSceneAuthority()?.encounterIds || [],
            items: this.getCurrentSceneAuthority()?.itemNames || [],
          }
        : null,
    });
  }

  /**
   * 核心处理流程：处理 AI 输出并更新世界状态
   */
  processAiResponse(rawText: string): ProcessAiResponseResult {
    // 1. 提取动作
    const rawActions = ActionProcessor.parse(rawText);
    trace("campaign.process", "received AI proposal", {
      rawText,
      parsedActions: summarizeActionsForTrace(rawActions),
      stateBefore: summarizeStateForTrace(this.state),
      guard: this.buildGuardSnapshot(),
    });
    const validatedActions: ParsedAction[] = [];
    const rejectedActions: RejectedAiAction[] = [];
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
        trace("campaign.process", "accepted AI action", {
          action,
          stateAfterAction: summarizeStateForTrace(this.state),
        });
        if (isPlayerRollRequest(action.type)) {
          hasPendingPlayerRollRequest = true;
        }
      } else {
        const rejection = this.explainRejectedAction(action);
        rejectedActions.push(rejection);
        console.warn(`[Campaign] 拦截到非法 AI 动作: ${action.originalTag}`);
        traceWarn("campaign.guard", "rejected AI action", {
          action,
          reason: rejection.reason,
          state: summarizeStateForTrace(this.state),
          guard: this.buildGuardSnapshot(),
        });
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

    trace("campaign.process", "completed AI proposal processing", {
      cleanText,
      validatedActions: summarizeActionsForTrace(finalActions),
      rejectedActions: rejectedActions.map((entry) => ({
        type: entry.action.type,
        payload: entry.action.payload,
        reason: entry.reason,
      })),
      emittedEvents: emittedEvents.map((event) => ({
        type: event.type,
        payload: event.payload,
        source: event.meta?.source,
      })),
      stateAfter: summarizeStateForTrace(this.state),
    });
    return { cleanText, validatedActions: finalActions, rejectedActions, emittedEvents };
  }

  /**
   * 动作校验逻辑 (The Guard)
   */
  private validateAction(action: ParsedAction): boolean {
    switch (action.type) {
      case "@MOVE":
        return this.validateMoveAction(action.payload);

      case "@ATTR_UPDATE":
        // 简单的格式校验 e.g. "HP:-5"
        return /^[A-Z]+:[-+]?\d+$/.test(action.payload.trim());

      case "@CHECK":
        return this.validateCheckAction(action.payload);

      case "@CHECK_SET":
        return this.validateCheckSetAction(action.payload);

      case "@ROLL":
        if (this.state.phase === "completed") {
          return false;
        }
        return isValidFormulaRoll(action.payload);

      case "@SESSION_END":
        return action.payload.trim().length > 0;

      case "@PLOT_UPDATE": {
        const plotNodeId = action.payload.trim();
        if (!plotNodeId) return false;
        if (this.state.plotProgress.includes(plotNodeId)) return false;
        const activeTriggerForPlot = this.state.triggerRuntime?.activeTrigger;
        if (activeTriggerForPlot) {
          const allowedPlotNodes = activeTriggerForPlot.deployable.plotNodeIds || [];
          if (allowedPlotNodes.length > 0 && !allowedPlotNodes.includes(plotNodeId)) {
            return false;
          }
        }
        return isPlotUpdateAllowed(this.modulePlotData, this.state.plotProgress, plotNodeId);
      }

      case "@VAR_UPDATE":
        return isValidVariableUpdate(action.payload);

      case "@INIT_COMBAT":
      case "@COMBAT_START":
        return this.validateCombatStart(action.payload);

      case "@ITEM_ADD": {
        const itemName = action.payload.trim();
        if (!itemName) return false;
        if (hasClaimedSceneItem(this.state, itemName)) {
          return false;
        }
        const activeTriggerForItem = this.state.triggerRuntime?.activeTrigger;
        if (activeTriggerForItem) {
          const triggerItemIds = activeTriggerForItem.deployable.itemIds || [];
          if (triggerItemIds.length > 0) {
            return triggerItemIds.some(
              (allowed) => allowed.toLowerCase() === itemName.toLowerCase(),
            );
          }
          // trigger exists but doesn't restrict items → fall through to scene whitelist
        }
        const currentLocation = this.getCurrentLocationData();
        const allowedItems =
          this.getCurrentSceneAuthority()?.itemNames ||
          (Array.isArray(currentLocation?.items)
            ? currentLocation.items
                .map((item: any) => String(item || "").trim())
                .filter(Boolean)
            : []);
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
    const events = applyCampaignAction({
      action,
      state: this.state,
      combatEngine: this.combatEngine,
      monsterLibrary: this.monsterLibrary,
      loadArea: (areaId) => this.loadArea(areaId),
      buildCombatId: () => this.buildCombatId(),
      createEvent: this.createEvent.bind(this) as CampaignEventFactory,
    });

    if (action.type === "@COMBAT_START" && this.state.triggerRuntime?.activeTrigger) {
      clearActiveTrigger(this.state);
      clearResolvedCheckScopes(this.state);
      console.log("[Campaign] 触发器已消费，activeTrigger 清除");
    }

    if (action.type === "@MOVE") {
      clearActiveTrigger(this.state);
      clearResolvedCheckScopes(this.state);
      console.log("[Campaign] 场景切换，activeTrigger 清除");
    }

    return events;
  }

  private onAreaLoad?: (areaId: string) => void;
  private monsterLibrary: any[] = [];

  setCallbacks(areaLoader: (areaId: string) => void) {
    this.onAreaLoad = areaLoader;
  }

  setMonsterLibrary(monsters: any[]) {
    this.monsterLibrary = monsters;
  }

  setModulePlot(modulePlotData: ModulePlotLike | null) {
    this.modulePlotData = modulePlotData;
  }

  setModuleAuthority(moduleAuthority: ModuleAuthority | null) {
    this.moduleAuthority = moduleAuthority;
  }

  /**
   * 检定结果回调：查找当前 scene 是否有匹配的 trigger，若有则激活并写入 triggerRuntime
   */
  applyCheckResult(outcome: {
    skill: string;
    dc: number;
    isSuccess: boolean;
    reason?: string;
    intent?: string;
  }): void {
    const resolvedScope = buildResolvedCheckScope(this.state, {
      skill: outcome.skill,
      dc: outcome.dc,
      reason: outcome.reason,
      intent: outcome.intent,
    });
    markResolvedCheckScope(this.state, resolvedScope);

    const sceneAuthority = this.getCurrentSceneAuthority();
    if (!sceneAuthority || sceneAuthority.triggers.length === 0) {
      return;
    }

    const normalizedSkill = outcome.skill.trim().toLowerCase();
    const trigger = sceneAuthority.triggers.find(
      (t) => t.when === "check_resolved" &&
             t.skill.toLowerCase() === normalizedSkill &&
             t.dc === outcome.dc,
    );
    if (!trigger) {
      trace("campaign.trigger", "check outcome had no matching trigger", {
        outcome,
        sceneId: `${this.state.currentAreaId}:${this.state.currentLocationId}`,
      });
      return;
    }

    const branchKey = outcome.isSuccess ? "success" : "failure";
    const branch = trigger.branches[branchKey];
    if (!branch) {
      traceWarn("campaign.trigger", "trigger matched but branch missing", {
        triggerId: trigger.id,
        branchKey,
      });
      return;
    }

    const activeTrigger: ActiveTriggerState = {
      triggerId: trigger.id,
      branch: branchKey,
      narrativeHint: branch.narrativeHint,
      deployable: branch.deployable,
    };

    if (!this.state.triggerRuntime) {
      this.state.triggerRuntime = { activeTrigger: null };
    }
    this.state.triggerRuntime.activeTrigger = activeTrigger;
    console.log(`[Campaign] 触发器激活: ${trigger.id} (${branchKey})`);
    trace("campaign.trigger", "active trigger updated", {
      outcome,
      activeTrigger,
      state: summarizeStateForTrace(this.state),
    });
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

  getModulePlotData() {
    return this.modulePlotData;
  }

  getCombatEngine() {
    return this.combatEngine;
  }

  getState(): EngineState {
    return this.state;
  }

  private getCurrentLocationData() {
    return this.currentAreaData?.locations?.find(
      (location: any) => location.id === this.state.currentLocationId,
    );
  }

  private getCurrentSceneAuthority() {
    return getSceneAuthority(
      this.moduleAuthority,
      this.state.currentAreaId,
      this.state.currentLocationId,
    );
  }

  private validateCheckAction(payload: string): boolean {
    if (
      !(
        CharacterManager.canTakeNormalAction(this.state.characterSheet) ||
        this.isRescueWindowOpen()
      )
    ) {
      return false;
    }

    const parsedCheck = parseCheckPayload(payload);
    if (!parsedCheck || !isValidCheckPayload(payload)) {
      return false;
    }

    const matchingSceneChecks = this.getAllowedSceneChecks().filter(
      (allowed) =>
        allowed.skill.toLowerCase() === parsedCheck.skill.toLowerCase() &&
        allowed.dc === parsedCheck.dc,
    );

    const resolvedScope = buildResolvedCheckScope(this.state, parsedCheck);
    if (
      hasResolvedCheckScope(this.state, resolvedScope, {
        allowSkillDcFallback: matchingSceneChecks.length <= 1,
      })
    ) {
      traceWarn("campaign.guard", "rejected duplicate resolved check", {
        payload,
        resolvedScope,
        state: summarizeStateForTrace(this.state),
      });
      return false;
    }

    if (matchingSceneChecks.length > 0 || this.hasExplicitSceneCheckRules()) {
      return matchingSceneChecks.length > 0;
    }

    return true;
  }

  private validateCheckSetAction(payload: string): boolean {
    if (
      !(
        CharacterManager.canTakeNormalAction(this.state.characterSheet) ||
        this.isRescueWindowOpen()
      )
    ) {
      return false;
    }

    const parsedCheckSet = parseCheckSetPayload(payload);
    if (!parsedCheckSet || !isValidCheckSetPayload(payload)) {
      return false;
    }

    const allowedSceneChecks = this.getAllowedSceneChecks();
    const hasSceneRules = this.hasExplicitSceneCheckRules();

    return parsedCheckSet.checks.every((check) => {
      const matchingSceneChecks = allowedSceneChecks.filter(
        (allowed) =>
          allowed.skill.toLowerCase() === check.skill.toLowerCase() &&
          allowed.dc === check.dc,
      );
      const resolvedScope = buildResolvedCheckScope(this.state, check);
      if (
        hasResolvedCheckScope(this.state, resolvedScope, {
          allowSkillDcFallback: matchingSceneChecks.length <= 1,
        })
      ) {
        traceWarn("campaign.guard", "rejected duplicate resolved check from check set", {
          payload,
          resolvedScope,
          state: summarizeStateForTrace(this.state),
        });
        return false;
      }

      if (matchingSceneChecks.length > 0 || hasSceneRules) {
        return matchingSceneChecks.length > 0;
      }

      return true;
    });
  }

  private explainRejectedAction(action: ParsedAction): RejectedAiAction {
    if (action.type === "@CHECK") {
      return {
        action,
        reason: this.getCheckRejectionReason(action.payload),
      };
    }

    if (action.type === "@CHECK_SET") {
      return {
        action,
        reason: this.getCheckSetRejectionReason(action.payload),
      };
    }

    return {
      action,
      reason: "generic_invalid",
    };
  }

  private getCheckRejectionReason(payload: string): ActionRejectionReason {
    if (
      !(
        CharacterManager.canTakeNormalAction(this.state.characterSheet) ||
        this.isRescueWindowOpen()
      )
    ) {
      return "blocked_by_state";
    }

    const parsedCheck = parseCheckPayload(payload);
    if (!parsedCheck || !isValidCheckPayload(payload)) {
      return "invalid_check_payload";
    }

    const matchingSceneChecks = this.getAllowedSceneChecks().filter(
      (allowed) =>
        allowed.skill.toLowerCase() === parsedCheck.skill.toLowerCase() &&
        allowed.dc === parsedCheck.dc,
    );
    const resolvedScope = buildResolvedCheckScope(this.state, parsedCheck);
    if (
      hasResolvedCheckScope(this.state, resolvedScope, {
        allowSkillDcFallback: matchingSceneChecks.length <= 1,
      })
    ) {
      return "duplicate_resolved_check";
    }

    if (matchingSceneChecks.length > 0 || this.hasExplicitSceneCheckRules()) {
      if (matchingSceneChecks.length === 0) {
        return "check_not_allowed_in_scene";
      }
    }

    return "generic_invalid";
  }

  private getCheckSetRejectionReason(payload: string): ActionRejectionReason {
    if (
      !(
        CharacterManager.canTakeNormalAction(this.state.characterSheet) ||
        this.isRescueWindowOpen()
      )
    ) {
      return "blocked_by_state";
    }

    const parsedCheckSet = parseCheckSetPayload(payload);
    if (!parsedCheckSet || !isValidCheckSetPayload(payload)) {
      return "invalid_check_payload";
    }

    const allowedSceneChecks = this.getAllowedSceneChecks();
    const hasSceneRules = this.hasExplicitSceneCheckRules();

    for (const check of parsedCheckSet.checks) {
      const matchingSceneChecks = allowedSceneChecks.filter(
        (allowed) =>
          allowed.skill.toLowerCase() === check.skill.toLowerCase() &&
          allowed.dc === check.dc,
      );
      const resolvedScope = buildResolvedCheckScope(this.state, check);
      if (
        hasResolvedCheckScope(this.state, resolvedScope, {
          allowSkillDcFallback: matchingSceneChecks.length <= 1,
        })
      ) {
        return "duplicate_resolved_check";
      }
      if ((matchingSceneChecks.length > 0 || hasSceneRules) && matchingSceneChecks.length === 0) {
        return "check_not_allowed_in_scene";
      }
    }

    return "generic_invalid";
  }

  private hasExplicitSceneCheckRules(): boolean {
    return this.getAllowedSceneChecks().length > 0;
  }

  private getAllowedSceneChecks(): Array<{ skill: string; dc: number; reason: string }> {
    const sceneActionTags =
      this.getCurrentSceneAuthority()?.actions ||
      (Array.isArray(this.getCurrentLocationData()?.actions)
        ? this.getCurrentLocationData().actions
        : []);

    return sceneActionTags.flatMap((actionTag: string) => {
      const normalizedTag = String(actionTag || "").trim();
      const parsedActions = ActionProcessor.parse(
        normalizedTag.startsWith("[") ? normalizedTag : `[${normalizedTag}]`,
      );
      return parsedActions.flatMap((action) => {
        if (action.type === "@CHECK") {
          const parsedCheck = parseCheckPayload(action.payload);
          return parsedCheck ? [parsedCheck] : [];
        }

        if (action.type === "@CHECK_SET") {
          const parsedCheckSet = parseCheckSetPayload(action.payload);
          return parsedCheckSet?.checks || [];
        }

        return [];
      });
    });
  }

  private validateMoveAction(payload: string): boolean {
    const requestedRef = payload.trim();
    if (!requestedRef) {
      return false;
    }

    const currentScene = this.getCurrentSceneAuthority();
    if (currentScene) {
      return currentScene.exits.some((exit) => exit.ref === requestedRef);
    }

    const currentLocation = this.getCurrentLocationData();
    const allowedConnections = Array.isArray(currentLocation?.connections)
      ? currentLocation.connections
      : [];
    return allowedConnections.includes(requestedRef);
  }

  private validateCombatStart(payload: string): boolean {
    const requestedIds = parseListPayload(payload);
    if (requestedIds.length === 0) {
      return false;
    }

    const activeTrigger = this.state.triggerRuntime?.activeTrigger;
    if (activeTrigger) {
      const allowed = new Set(activeTrigger.deployable.encounterIds || []);
      if (allowed.size === 0) {
        return false;
      }
      return requestedIds.every((id) => allowed.has(id));
    }

    const currentLocation = this.getCurrentLocationData();
    const allowedEncounterIds =
      this.getCurrentSceneAuthority()?.encounterIds ||
      (Array.isArray(currentLocation?.encounters)
        ? currentLocation.encounters
            .map((entry: any) => String(entry || "").trim())
            .filter(Boolean)
        : []);

    if (allowedEncounterIds.length === 0) {
      return false;
    }

    return requestedIds.every((id) => allowedEncounterIds.includes(id));
  }

  private buildCombatId(): string {
    return `combat_${Date.now()}_${this.eventSequence + 1}`;
  }

  private buildGuardSnapshot() {
    const currentScene = this.getCurrentSceneAuthority();
    const activeTrigger = this.state.triggerRuntime?.activeTrigger;

    return {
      sceneId: `${this.state.currentAreaId}:${this.state.currentLocationId}`,
      exits: currentScene?.exits?.map((entry) => entry.ref) || [],
      encounters: currentScene?.encounterIds || [],
      items: currentScene?.itemNames || [],
      resolvedChecks: this.state.resolutionRuntime?.resolvedChecks || [],
      allowedPlotUpdates: this.modulePlotData
        ? {
            completed: [...this.state.plotProgress],
          }
        : null,
      activeTrigger: activeTrigger
        ? {
            triggerId: activeTrigger.triggerId,
            branch: activeTrigger.branch,
            deployable: activeTrigger.deployable,
          }
        : null,
    };
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
