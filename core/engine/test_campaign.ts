import { CampaignManager } from "./CampaignManager.js";
import type { GameState } from "./CampaignManager.js";
import { compileModuleAuthority } from "./campaignAuthority.js";
import { DEFAULT_CHARACTER } from "./DefaultCharacter.js";
import type { KnownEngineEvent } from "../session/EngineEvent.js";
import type { ModulePlotLike } from "./campaignPlotUtils.js";
import {
  calculateCheckResult,
  resolveCheckSetup,
} from "../rules/CoreRules.js";

/**
 * 战役总管集成测试：验证逻辑笼子是否能在大规模数据下闭环
 */
function testCampaignIntegration() {
  console.log("🚀 开始验证战役总管 (CampaignManager)...");
  const character = structuredClone(DEFAULT_CHARACTER);
  character.hp.current = 20;
  character.hp.max = 20;
  character.checkModifiers = [
    {
      label: "高地优势",
      value: 1,
      scope: "skill",
      target: "Perception",
    },
  ];

  // 1. 模拟初始状态 (玩家在 E01 大门)
  const initialState: GameState = {
    currentModule: "ELDORA_001",
    currentAreaId: "THORN_VILLAGE",
    currentLocationId: "E01",
    characterSheet: character,
    party: [character],
    plotProgress: [],
    activeQuestIds: [],
    isCombatActive: false,
    variables: {},
    sessionMode: "solo",
    phase: "exploration",
    activeScene: {
      sceneId: "THORN_VILLAGE:E01",
      areaId: "THORN_VILLAGE",
      locationId: "E01",
      tags: [],
    },
  };

  // 2. 模拟剧本数据 (由数据积木提供)
  const mockManifest = {
    name: "艾尔多拉之影",
    type: "manifest",
    globalVariables: {},
  };
  const mockPlotData: ModulePlotLike = {
    plotTitle: "测试剧情",
    mainObjective: "进入岗哨",
    plotPoints: [
      {
        id: "PP001",
        title: "进入岗哨",
        status: "active",
        nextPoints: ["PP002"],
      },
      {
        id: "PP002",
        title: "调查广场",
        status: "not started",
      },
    ],
  };
  const mockAreaData = {
    areaId: "THORN_VILLAGE",
    locations: [
      {
        id: "E01",
        name: "大门",
        connections: ["E02"],
        actions: ["@CHECK(感知:14:观察门后动静)"],
      },
      {
        id: "E02",
        name: "广场",
        connections: ["E01", "E03"],
        encounters: ["fallen_guard"],
        items: ["旧钥匙"],
      },
    ],
  };
  const moduleAuthority = compileModuleAuthority([mockAreaData]);

  const camp = new CampaignManager(initialState);
  camp.setModuleAuthority(moduleAuthority);
  camp.initialize(mockManifest, mockAreaData, mockPlotData);
  camp.setMonsterLibrary([{ id: "fallen_guard", name: "堕落卫兵" }]);

  // 3. 模拟一次包含“非法瞬移”的 AI 输出
  // AI 尝试从 E01 瞬移到 E03 (非法，中间隔着 E02)
  const rawResponse =
    "你看守员点点头，示意你进去。你瞬间出现在了深处的喷泉旁。[@MOVE(E03)] [@ATTR_UPDATE(HP:-5)] [@ROLL(短剑伤害:1d6+DEX)]";

  console.log("--- 运行逻辑处理 ---");
  const result = camp.processAiResponse(rawResponse);
  const initialEventTypes = result.emittedEvents.map((event) => event.type);

  // 4. 验证拦截结果
  console.log("清理后的叙事:", result.cleanText);

  const moveInActions = result.validatedActions.some((a) => a.type === "@MOVE");
  const attrUpdated = result.validatedActions.some(
    (a) => a.type === "@ATTR_UPDATE",
  );
  const rollRequested = result.validatedActions.some((a) => a.type === "@ROLL");

  if (!moveInActions && attrUpdated && rollRequested) {
    console.log(
      "✅ 拦截测试成功：[@MOVE(E03)] 因为路径非法被成功拦截，[@ATTR_UPDATE] 与 [@ROLL] 被正确保留。",
    );
  } else {
    throw new Error(
      `❌ 拦截测试失败：结果不符合物理规则 ${JSON.stringify(result.validatedActions)}`,
    );
  }

  if (
    initialEventTypes.includes("AI_PROPOSAL_RECEIVED") &&
    initialEventTypes.includes("ATTRIBUTE_UPDATED") &&
    initialEventTypes.includes("DAMAGE_APPLIED") &&
    initialEventTypes.includes("ROLL_REQUESTED") &&
    !initialEventTypes.includes("MOVE_RESOLVED")
  ) {
    console.log("✅ 事件输出测试成功：非法移动不会产出 MOVE_RESOLVED，合法状态变化会生成权威事件。");
  } else {
    throw new Error(
      `❌ 事件输出测试失败 ${JSON.stringify(result.emittedEvents)}`,
    );
  }

  // 5. 验证状态同步
  const finalState = camp.getState();
  if (
    finalState.characterSheet.hp.current === 15 &&
    finalState.currentLocationId === "E01"
  ) {
    console.log(
      "✅ 状态保存测试成功：HP 扣除正确，位置锁定在 E01 未被非法跳变。",
    );
  } else {
    throw new Error(`❌ 状态保存测试失败 ${JSON.stringify(finalState)}`);
  }

  const rejectedCheckResult = camp.processAiResponse(
    "你想硬掰开门闩。[@CHECK(力量:14:强行掰开门闩)]",
  );
  if (rejectedCheckResult.validatedActions.some((action) => action.type === "@CHECK")) {
    throw new Error(`❌ 检定白名单测试失败：不应允许当前场景外的检定 ${JSON.stringify(rejectedCheckResult)}`);
  }
  console.log("✅ 检定白名单测试成功：scene.actions 之外的检定会被拦截。");

  const allowedCheckResult = camp.processAiResponse(
    "你侧耳听门后的动静。[@CHECK(感知:14:观察门后动静)]",
  );
  if (!allowedCheckResult.validatedActions.some((action) => action.type === "@CHECK")) {
    throw new Error(`❌ 检定放行测试失败：scene.actions 中的检定应被允许 ${JSON.stringify(allowedCheckResult)}`);
  }
  camp.applyCheckResult({
    skill: "感知",
    dc: 14,
    isSuccess: true,
    reason: "观察门后动静",
    intent: "过一个感知",
  });
  const duplicateCheckResult = camp.processAiResponse(
    "你再次屏住呼吸去听门后。[@CHECK(感知:14:观察门后动静)]",
  );
  if (duplicateCheckResult.validatedActions.some((action) => action.type === "@CHECK")) {
    throw new Error(`❌ 重复检定锁测试失败：同一场景同一检定不应重复发起 ${JSON.stringify(duplicateCheckResult)}`);
  }
  console.log("✅ 重复检定锁测试成功：已结算检定会阻止同场景重复发起。");

  const validMoveResponse = "你沿着破门进入广场。[@MOVE(E02)]";
  const validMoveResult = camp.processAiResponse(validMoveResponse);
  const moveEvent = validMoveResult.emittedEvents.find(
    (
      event,
    ): event is Extract<KnownEngineEvent, { type: "MOVE_RESOLVED" }> =>
      event.type === "MOVE_RESOLVED",
  );

  if (
    camp.getState().currentLocationId === "E02" &&
    moveEvent?.payload.fromLocationId === "E01" &&
    moveEvent.payload.toLocationId === "E02"
  ) {
    console.log("✅ 移动回放测试成功：合法移动会同步落成 MOVE_RESOLVED 事件。");
  } else {
    throw new Error(`❌ 移动回放测试失败 ${JSON.stringify(validMoveResult)}`);
  }

  const invalidPlotResponse = "故事忽然跳到了后续调查。[@PLOT_UPDATE(PP002)]";
  const invalidPlotResult = camp.processAiResponse(invalidPlotResponse);
  if (invalidPlotResult.validatedActions.some((action) => action.type === "@PLOT_UPDATE")) {
    throw new Error(`❌ 剧情护栏测试失败：不应允许直接推进 PP002 ${JSON.stringify(invalidPlotResult)}`);
  }
  console.log("✅ 剧情护栏测试成功：未解锁 plot node 会被拦截。");

  const validPlotResponse = "你终于闯入岗哨。[@PLOT_UPDATE(PP001)]";
  const validPlotResult = camp.processAiResponse(validPlotResponse);
  if (
    !validPlotResult.validatedActions.some((action) => action.type === "@PLOT_UPDATE") ||
    !camp.getState().plotProgress.includes("PP001")
  ) {
    throw new Error(`❌ 剧情推进测试失败：PP001 应可推进 ${JSON.stringify(validPlotResult)}`);
  }
  console.log("✅ 剧情推进测试成功：当前 active plot node 可被正常落地。");

  const validCombatResponse = "阴影中的卫兵扑了出来。[@COMBAT_START(fallen_guard)]";
  const validCombatResult = camp.processAiResponse(validCombatResponse);
  if (!validCombatResult.validatedActions.some((action) => action.type === "@COMBAT_START")) {
    throw new Error(`❌ 战斗白名单测试失败：当前场景 encounter 应允许开战 ${JSON.stringify(validCombatResult)}`);
  }
  console.log("✅ 战斗白名单测试成功：当前场景允许的 encounter 可触发。");

  camp.processAiResponse("[@COMBAT_END]");
  const invalidCombatResponse = "一头凭空出现的狼人扑了出来。[@COMBAT_START(werewolf)]";
  const invalidCombatResult = camp.processAiResponse(invalidCombatResponse);
  if (invalidCombatResult.validatedActions.some((action) => action.type === "@COMBAT_START")) {
    throw new Error(`❌ 战斗护栏测试失败：不应允许当前场景外的敌人开战 ${JSON.stringify(invalidCombatResult)}`);
  }
  console.log("✅ 战斗护栏测试成功：当前场景外 encounter 会被拦截。");

  const validItemResponse = "你在喷泉边捡起一把旧钥匙。[@ITEM_ADD(旧钥匙)]";
  const validItemResult = camp.processAiResponse(validItemResponse);
  if (!validItemResult.validatedActions.some((action) => action.type === "@ITEM_ADD")) {
    throw new Error(`❌ 物品白名单测试失败：当前场景可得物品应允许获取 ${JSON.stringify(validItemResult)}`);
  }
  console.log("✅ 物品白名单测试成功：当前场景允许的物品可获取。");

  const duplicateItemResult = camp.processAiResponse(validItemResponse);
  if (duplicateItemResult.validatedActions.some((action) => action.type === "@ITEM_ADD")) {
    throw new Error(`❌ 物品去重测试失败：同一场景物品不应重复获取 ${JSON.stringify(duplicateItemResult)}`);
  }
  console.log("✅ 物品去重测试成功：同一场景物品不会被重复获取。");

  const invalidItemResponse = "你在瓦砾间翻出一把不存在的圣剑。[@ITEM_ADD(圣剑)]";
  const invalidItemResult = camp.processAiResponse(invalidItemResponse);
  if (invalidItemResult.validatedActions.some((action) => action.type === "@ITEM_ADD")) {
    throw new Error(`❌ 物品护栏测试失败：不应允许获取场景白名单外物品 ${JSON.stringify(invalidItemResult)}`);
  }
  console.log("✅ 物品护栏测试成功：当前场景外物品会被拦截。");

  const checkSetResponse =
    '你可以用蛮力硬扯，也可以借势滑脱。[@CHECK_SET({"mode":"choose_one","label":"脱离死尸拖拽","explanation":"你必须立刻在力量硬扯与身体滑脱之间选一种解法。","checks":[{"skill":"运动","dc":13,"reason":"死尸的指节已经扣进靴帮，你得靠纯粹蛮力撕开钳制。"},{"skill":"杂技","dc":13,"reason":"冻泥湿滑又贴身，你得借扭身与重心变化滑脱。"}]})]';
  const checkSetResult = camp.processAiResponse(checkSetResponse);
  const checkSetEvent = checkSetResult.emittedEvents.find(
    (
      event,
    ): event is Extract<KnownEngineEvent, { type: "CHECK_REQUESTED" }> =>
      event.type === "CHECK_REQUESTED",
  );

  if (
    checkSetResult.validatedActions.length === 1 &&
    checkSetResult.validatedActions[0]?.type === "@CHECK_SET" &&
    checkSetEvent?.payload.mode === "choose_one" &&
    checkSetEvent.payload.checks.length === 2
  ) {
    console.log("✅ 多检定协议测试成功：@CHECK_SET 可以作为单个待处理检定包进入引擎。");
  } else {
    throw new Error(
      `❌ 多检定协议测试失败 ${JSON.stringify(checkSetResult)}`,
    );
  }

  const lethalResponse =
    "冰冷的力量拖拽着你。[@ATTR_UPDATE(HP:-20)] [@CHECK(运动:13)] [@CHECK(杂技:13)]";
  const lethalResult = camp.processAiResponse(lethalResponse);
  const survivingChecks = lethalResult.validatedActions.filter(
    (action) => action.type === "@CHECK",
  );
  const lethalEventTypes = lethalResult.emittedEvents.map((event) => event.type);

  if (
    camp.getState().characterSheet.hp.current === 0 &&
    camp.getState().phase === "endgame" &&
    survivingChecks.length === 0 &&
    lethalEventTypes.includes("ATTRIBUTE_UPDATED") &&
    lethalEventTypes.includes("DAMAGE_APPLIED") &&
    !lethalEventTypes.includes("CHECK_REQUESTED")
  ) {
    console.log("✅ 倒地拦截测试成功：0 HP 后会进入终局态，且不会再保留普通检定请求。");
  } else {
    throw new Error(
      `❌ 倒地拦截测试失败 ${JSON.stringify(lethalResult)}`,
    );
  }

  const rescueResponse =
    "你仍有一线生机。[@VAR_UPDATE(last_chance_available:true)] [@CHECK(体质:10)]";
  const rescueResult = camp.processAiResponse(rescueResponse);
  const rescueChecks = rescueResult.validatedActions.filter(
    (action) => action.type === "@CHECK",
  );
  const rescueEvent = rescueResult.emittedEvents.find(
    (
      event,
    ): event is Extract<KnownEngineEvent, { type: "VARIABLE_UPDATED" }> =>
      event.type === "VARIABLE_UPDATED",
  );

  if (
    camp.getState().phase === "endgame" &&
    camp.getState().variables.last_chance_available === true &&
    rescueChecks.length === 1 &&
    rescueEvent?.payload.key === "last_chance_available" &&
    rescueEvent.payload.newValue === true
  ) {
    console.log("✅ 救援窗口测试成功：DM 显式开放救援后，可重新放行一次检定。");
  } else {
    throw new Error(
      `❌ 救援窗口测试失败 ${JSON.stringify(rescueResult)}`,
    );
  }

  const sessionEndResponse =
    "你的视线彻底沉了下去。[@SESSION_END(守门死尸将你拖入门后，冒险在此终结。)] [@CHECK(体质:10)]";
  const sessionEndResult = camp.processAiResponse(sessionEndResponse);
  const sessionEndEvent = sessionEndResult.emittedEvents.find(
    (
      event,
    ): event is Extract<KnownEngineEvent, { type: "SESSION_ENDED" }> =>
      event.type === "SESSION_ENDED",
  );

  if (
    camp.getState().phase === "completed" &&
    camp.getState().variables.session_end_reason ===
      "守门死尸将你拖入门后，冒险在此终结。" &&
    sessionEndResult.validatedActions.every(
      (action) => action.type !== "@CHECK" && action.type !== "@SESSION_END",
    ) &&
    sessionEndEvent?.payload.reason ===
      "守门死尸将你拖入门后，冒险在此终结。"
  ) {
    console.log("✅ 会话结束测试成功：终局裁定可以正式结束本局，并生成 SESSION_ENDED 事件。");
  } else {
    throw new Error(
      `❌ 会话结束测试失败 ${JSON.stringify(sessionEndResult)}`,
    );
  }

  const checkSetup = resolveCheckSetup(
    "感知",
    character.abilities,
    character.proficiencies.skills,
    character.level,
    {
      checkModifiers: character.checkModifiers,
    },
  );
  const persuasionSetup = resolveCheckSetup(
    "说服",
    character.abilities,
    character.proficiencies.skills,
    character.level,
    {
      checkModifiers: character.checkModifiers,
    },
  );
  const critResult = calculateCheckResult(
    20,
    "感知",
    character.abilities,
    character.proficiencies.skills,
    character.level,
    {
      checkModifiers: character.checkModifiers,
    },
  );
  const highCritResult = calculateCheckResult(
    19,
    "感知",
    character.abilities,
    character.proficiencies.skills,
    character.level,
    {
      checkModifiers: character.checkModifiers,
    },
  );
  const fumbleResult = calculateCheckResult(
    1,
    "感知",
    character.abilities,
    character.proficiencies.skills,
    character.level,
    {
      checkModifiers: character.checkModifiers,
    },
  );

  if (
    checkSetup.previewExpression.includes("1d20") &&
    checkSetup.previewExpression.includes("感知调整值(+2)") &&
    checkSetup.previewExpression.includes("熟练加值(+2)") &&
    checkSetup.previewExpression.includes("高地优势(+1)") &&
    persuasionSetup.abilityKey === "cha" &&
    persuasionSetup.previewExpression.includes("魅力调整值(+0)") &&
    critResult.rollSignal === "high" &&
    highCritResult.rollSignal === "high" &&
    fumbleResult.rollSignal === "low" &&
    critResult.breakdown.expression.includes("1d20(20)") &&
    critResult.total === 25
  ) {
    console.log("✅ 检定拆解测试成功：基础骰、属性、熟练、临时修正与原始骰信号均可回放。");
  } else {
    throw new Error(
      `❌ 检定拆解测试失败 ${JSON.stringify({
        checkSetup,
        critResult,
        fumbleResult,
      })}`,
    );
  }

  console.log("🏁 战役管理逻辑验证完毕：全线通过。");
}

/**
 * 回归测试：trigger 生命周期 — 场景切换时 activeTrigger 必须清除
 */
function testTriggerLifecycle() {
  console.log("\n🚀 开始验证 Trigger 生命周期...");

  const character = structuredClone(DEFAULT_CHARACTER);
  character.hp.current = 20;
  character.hp.max = 20;

  const initialState: GameState = {
    currentModule: "TEST_MODULE",
    currentAreaId: "DUNGEON",
    currentLocationId: "C01",
    characterSheet: character,
    party: [character],
    plotProgress: [],
    activeQuestIds: [],
    isCombatActive: false,
    variables: {},
    sessionMode: "solo",
    phase: "exploration",
  };

  const areaData = {
    areaId: "DUNGEON",
    locations: [
      {
        id: "C01",
        name: "长廊",
        connections: ["C02"],
        encounters: ["guard_alert", "guard_ambush"],
        triggers: [
          {
            id: "TRIG_C01_AWARENESS",
            when: "check_resolved",
            skill: "感知",
            dc: 12,
            branches: {
              success: {
                narrativeHint: "先手",
                deployable: { encounterIds: ["guard_alert"] },
              },
              failure: {
                narrativeHint: "偷袭",
                deployable: { encounterIds: ["guard_ambush"] },
              },
            },
          },
        ],
      },
      {
        id: "C02",
        name: "祭坛",
        connections: ["C01"],
        encounters: ["shadow_spirit"],
      },
    ],
  };

  const moduleAuthority = compileModuleAuthority([areaData]);
  const camp = new CampaignManager(initialState);
  camp.setModuleAuthority(moduleAuthority);
  camp.initialize({ name: "测试", globalVariables: {} }, areaData, null);
  camp.setMonsterLibrary([
    { id: "guard_alert", name: "卫兵（警觉）" },
    { id: "guard_ambush", name: "卫兵（偷袭）" },
    { id: "shadow_spirit", name: "幽灵" },
  ]);

  // 1. 检定成功 → activeTrigger 激活，只允许 guard_alert
  camp.applyCheckResult({ skill: "感知", dc: 12, isSuccess: true });
  const stateAfterCheck = camp.getState();
  if (stateAfterCheck.triggerRuntime?.activeTrigger?.triggerId !== "TRIG_C01_AWARENESS") {
    throw new Error("❌ Trigger 激活测试失败：applyCheckResult 后 activeTrigger 应被写入");
  }
  if (stateAfterCheck.triggerRuntime?.activeTrigger?.branch !== "success") {
    throw new Error("❌ Trigger 分支测试失败：应为 success 分支");
  }
  console.log("✅ Trigger 激活测试成功：检定后 activeTrigger 写入正确。");

  // 2. trigger 激活时，guard_ambush 应被阻止
  const ambushResult = camp.processAiResponse("[@COMBAT_START(guard_ambush)]");
  if (ambushResult.validatedActions.some((a) => a.type === "@COMBAT_START")) {
    throw new Error("❌ Trigger 收窄测试失败：激活 trigger 后不应允许非 success 分支的 encounter");
  }
  console.log("✅ Trigger 收窄测试成功：非 trigger 分支 encounter 被拦截。");

  // 3. @MOVE 后 activeTrigger 必须清除
  camp.processAiResponse("[@MOVE(C02)]");
  const stateAfterMove = camp.getState();
  if (stateAfterMove.currentLocationId !== "C02") {
    throw new Error("❌ 移动测试失败：应已移动至 C02");
  }
  if (stateAfterMove.triggerRuntime?.activeTrigger !== null) {
    throw new Error("❌ Trigger 清除测试失败：@MOVE 后 activeTrigger 应为 null，但仍有值");
  }
  console.log("✅ Trigger 清除测试成功：@MOVE 后 activeTrigger 已清除。");

  // 4. 移动后 C02 的 possibilitySpace 不被旧 trigger 污染（shadow_spirit 应可触发）
  const shadowResult = camp.processAiResponse("[@COMBAT_START(shadow_spirit)]");
  if (!shadowResult.validatedActions.some((a) => a.type === "@COMBAT_START")) {
    throw new Error("❌ 跨场景污染测试失败：移动后 C02 的合法 encounter 应可触发");
  }
  console.log("✅ 跨场景污染测试成功：移动后新场景 possibilitySpace 不受旧 trigger 污染。");

  // 5. @COMBAT_START 落地后 activeTrigger 也应清除（重置场景，回 C01 再验证）
  camp.processAiResponse("[@COMBAT_END]");
  camp.processAiResponse("[@MOVE(C01)]");
  camp.applyCheckResult({ skill: "感知", dc: 12, isSuccess: false });
  if (!camp.getState().triggerRuntime?.activeTrigger) {
    throw new Error("❌ Trigger 重激活测试失败：回到 C01 后检定失败应重新激活 trigger");
  }
  camp.processAiResponse("[@COMBAT_START(guard_ambush)]");
  if (camp.getState().triggerRuntime?.activeTrigger !== null) {
    throw new Error("❌ Trigger 消费测试失败：@COMBAT_START 落地后 activeTrigger 应为 null");
  }
  console.log("✅ Trigger 消费测试成功：@COMBAT_START 落地后 activeTrigger 已清除。");

  console.log("🏁 Trigger 生命周期验证完毕：全线通过。");
}

testCampaignIntegration();
testTriggerLifecycle();
