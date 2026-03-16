import { CampaignManager } from "../engine/CampaignManager.js";
import type { GameState } from "../engine/CampaignManager.js";
import { DEFAULT_CHARACTER } from "../engine/DefaultCharacter.js";
import { AIEngine } from "./AIEngine.js";
import type { PromptContext } from "./AIEngine.js";
import type { KnownEngineEvent } from "../session/EngineEvent.js";
import type { ModulePlotLike } from "../engine/campaignPlotUtils.js";
import { validateNarrativeBoundaries } from "../validation/NarrativeBoundaryValidator.js";

/**
 * 全系统合龙测试：从玩家输入到逻辑校验的完整闭环
 */
async function testFullLoop() {
  console.log("🔥 开始全系统合龙验证 (End-to-End Loop)...");
  const character = structuredClone(DEFAULT_CHARACTER);

  // 1. 初始化核心组件
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

  const mockAreaData = {
    areaId: "THORN_VILLAGE",
    areaName: "黑荆棘岗哨",
    areaDescription: "荒废的边境地点",
    locations: [
      {
        id: "E01",
        name: "大门",
        description: "破败的铁门",
        connections: ["E02"],
      },
      {
        id: "E02",
        name: "广场",
        description: "干枯的喷泉",
        connections: ["E01"],
      },
    ],
  };
  const mockPlotData: ModulePlotLike = {
    plotTitle: "测试剧情",
    mainObjective: "进入岗哨",
    plotPoints: [
      { id: "PP001", title: "进入岗哨", status: "active", nextPoints: ["PP002"] },
      { id: "PP002", title: "调查广场", status: "not started" },
    ],
  };

  const camp = new CampaignManager(initialState);
  const ai = new AIEngine(); // 默认进入 Mock 模式

  // 2. 模拟玩家交互：玩家说“我要进去”
  const userInput = "我要推开门进去。";
  console.log(`[Player]: ${userInput}`);

  // 3. AI 生成叙事 (通过我们的 AIEngine)
  const context: PromptContext = {
    moduleName: "艾尔多拉之影",
    moduleDescription: "...",
    worldTone: "Dark Fantasy",
    currentAreaName: mockAreaData.areaName,
    currentAreaDescription: mockAreaData.areaDescription,
    currentLocationName: "大门",
    currentLocationDescription: "破败的铁门",
    availableConnections: ["E02"],
    availableExitOptions: [{ id: "E02", name: "广场", areaName: "黑荆棘岗哨" }],
    currentLocationActions: ["@CHECK(感知:14)"],
    currentLocationDmNotes: "无令牌者不得通过此门。",
    npcs: [],
    npcDmNotes: ["看守员会拒绝放行陌生人。"],
    playerState: initialState,
    plotObjective: "进入岗哨",
    modulePlot: mockPlotData,
    equippedItemsSummary: "Leather Armor（armor，已装备）；Shortsword（weapon，已装备）；Longbow（weapon，已装备）",
    inventorySummary: "Leather Armor（armor，已装备）；Shortsword（weapon，已装备）；Longbow（weapon，已装备）",
    allowedNpcSpeakerNames: [],
    knownLocationNames: ["大门", "广场", "祭坛"],
  };

  const prompt = (ai as any).buildSystemPrompt(context) as string;
  const hpSummary = `"hp":"${character.hp.current}/${character.hp.max}"`;
  const promptChecks = [
    ["ctx_packet", prompt.includes("[CTX_PACKET]")],
    ["intent_is_not_fact", prompt.includes("玩家输入=意图，不=事实")],
    ["inventory_summary", prompt.includes("Shortsword")],
    ["adjudication_authority", prompt.includes("你拥有裁定权") || prompt.includes("裁定权在你")],
    ["hide_raw_ids", prompt.includes("不暴露原始 ID")],
    ["known_location_name", prompt.includes("广场")],
    ["check_tag", prompt.includes("[@CHECK(skill:dc:reason)]")],
    ["roll_tag", prompt.includes("[@ROLL(label:formula)]")],
    ["check_set_choose_one", prompt.includes("choose_one")],
    ["check_set_all", prompt.includes("all")],
    ["sys_check_result", prompt.includes("[SYS_CHECK_RESULT]")],
    ["sys_check_set_result", prompt.includes("[SYS_CHECK_SET_RESULT]")],
    ["sys_roll_result", prompt.includes("[SYS_ROLL_RESULT]")],
    ["sys_endgame_directive", prompt.includes("[SYS_ENDGAME_DIRECTIVE]")],
    ["sys_turn_resolution", prompt.includes("[SYS_TURN_RESOLUTION]")],
    ["allowed_next_plot", prompt.includes('"allowedNext":["PP001"]')],
    ["hp_summary", prompt.includes(hpSummary)],
    ["player_ready_status", prompt.includes('"status":"ready"')],
    ["phase_exploration", prompt.includes('"phase":"exploration"')],
    ["rescue_window_flag", prompt.includes('"rescueWindow":false')],
    ["last_chance_tag", prompt.includes("[@VAR_UPDATE(last_chance_available:true)]")],
    ["session_end_tag", prompt.includes("[@SESSION_END(reason)]")],
    ["prompt_length<=4200", prompt.length <= 4200],
  ] as const;

  const failedChecks = promptChecks
    .filter(([, passed]) => !passed)
    .map(([label]) => label);

  if (failedChecks.length > 0) {
    throw new Error(
      `❌ AI 提示词 contract 断言失败: ${failedChecks.join(", ")} (length=${prompt.length})`,
    );
  }

  const rawAiText = await ai.generate(userInput, context);
  console.log(`[AI Raw]: ${rawAiText}`);

  const invalidNarrative = "你来到祭坛中央。<<NPC:黑匠>>“跟我来。”<</NPC>>";
  const validation = validateNarrativeBoundaries(invalidNarrative, context);
  if (validation.valid) {
    throw new Error("❌ Narrative validator 未能识别越界地点或 NPC。");
  }
  console.log("✅ Narrative validator 测试成功：可识别越界地点与不在场 NPC。");

  const invalidActionNarrative =
    "你顺手拾起一瓶不存在的药剂，然后突然闯进祭坛。[@ITEM_ADD(秘银药剂)] [@PLOT_UPDATE(PP002)]";
  const actionValidation = validateNarrativeBoundaries(invalidActionNarrative, context);
  if (actionValidation.valid) {
    throw new Error("❌ Narrative validator 未能识别越界物品或非法剧情推进。");
  }
  console.log("✅ Narrative validator 动作测试成功：可识别越界物品与越界 plot 更新。");

  // 4. 逻辑笼子拦截并处理
  console.log("--- 逻辑裁判介入 ---");
  camp.initialize({ name: "艾尔多拉" }, mockAreaData, mockPlotData);
  const result = camp.processAiResponse(rawAiText);

  // 5. 验证结果
  console.log(`[Processed Narrative]: ${result.cleanText}`);
  console.log(`[Executed Actions]:`, result.validatedActions);

  const finalState = camp.getState();
  const moveEvent = result.emittedEvents.find(
    (
      event,
    ): event is Extract<KnownEngineEvent, { type: "MOVE_RESOLVED" }> =>
      event.type === "MOVE_RESOLVED",
  );
  if (finalState.currentLocationId === "E02") {
    if (
      moveEvent?.payload.fromLocationId === "E01" &&
      moveEvent.payload.toLocationId === "E02"
    ) {
      console.log("✅ 全系统合龙测试成功！AI 叙事驱动位置从 E01 变更到了 E02，并生成了 MOVE_RESOLVED 事件。");
    } else {
      throw new Error("❌ 全系统合龙测试失败：位置变更了，但没有落成可回放的 MOVE_RESOLVED 事件。");
    }
  } else {
    throw new Error("❌ 全系统合龙测试失败：状态未按预期变更。");
  }

  console.log("🏁 恭喜大神，逻辑闭环已完成。");
}

testFullLoop().catch((error) => {
  console.error(error);
  process.exit(1);
});
