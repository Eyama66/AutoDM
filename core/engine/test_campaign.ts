import { CampaignManager } from "./CampaignManager.js";
import type { GameState } from "./CampaignManager.js";
import { DEFAULT_CHARACTER } from "./DefaultCharacter.js";
import type { KnownEngineEvent } from "../session/EngineEvent.js";
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
  const mockAreaData = {
    areaId: "THORN_VILLAGE",
    locations: [
      { id: "E01", name: "大门", connections: ["E02"] },
      { id: "E02", name: "广场", connections: ["E01", "E03"] },
    ],
  };

  const camp = new CampaignManager(initialState);
  camp.initialize(mockManifest, mockAreaData);

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

testCampaignIntegration();
