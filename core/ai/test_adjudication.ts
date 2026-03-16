import { AIEngine } from "./AIEngine.js";
import {
  createFallbackAdjudication,
  parseIntentAdjudication,
} from "./IntentAdjudication.js";
import { buildAdjudicationSystemPrompt } from "./adjudicationPrompt.js";
import type { PromptContext } from "./AIEngine.js";
import { DEFAULT_CHARACTER } from "../engine/DefaultCharacter.js";

function buildMockContext(): PromptContext {
  const character = structuredClone(DEFAULT_CHARACTER);

  return {
    moduleName: "艾尔多拉之影",
    moduleDescription: "穿过岗哨，阻止苏醒的古老力量。",
    worldTone: "Dark Fantasy",
    currentAreaName: "黑荆棘岗哨区域",
    currentAreaDescription: "寒风与废墟笼罩着岗哨。",
    currentLocationName: "哨所大门",
    currentLocationDescription: "锈铁门紧闭，门边站着一个老兵。",
    availableConnections: ["E02", "E06"],
    availableExitOptions: [
      { id: "E02", name: "哨所广场", areaName: "黑荆棘岗哨区域" },
      { id: "E06", name: "坍塌的排水管", areaName: "黑荆棘岗哨区域" },
    ],
    currentLocationActions: ["@CHECK(感知:14)"],
    currentLocationEncounters: [],
    currentLocationItems: [],
    currentLocationDmNotes: "看守员会拒绝无令牌者。",
    npcs: [{ name: "看守员", dmNotes: "警惕外来者。" }],
    npcDmNotes: ["看守员会拒绝无令牌者。"],
    playerState: {
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
    },
    plotObjective: "进入黑荆棘岗哨。",
    equippedItemsSummary: "Shortsword",
    inventorySummary: "Shortsword",
    allowedNpcSpeakerNames: ["看守员"],
    knownLocationNames: ["哨所大门", "哨所广场", "坍塌的排水管"],
  };
}

async function testAdjudicationPrompt() {
  const prompt = buildAdjudicationSystemPrompt(buildMockContext());
  if (
    !prompt.includes("玩家输入永远是待裁定意图") ||
    !prompt.includes('"judgment": "allowed | blocked | partial | requires_check | clarify"') ||
    !prompt.includes("[CTX_PACKET]")
  ) {
    throw new Error("❌ adjudication prompt 缺少结构化裁定约束。");
  }

  console.log("✅ adjudication prompt 测试成功：已明确要求先裁定意图，再返回 JSON。");
}

async function testAdjudicationParser() {
  const parsed = parseIntentAdjudication(`\`\`\`json
{
  "summary": "玩家试图与看守员交谈。",
  "intentType": "talk",
  "judgment": "allowed",
  "reasons": [],
  "targets": { "npcNames": ["看守员"], "locationRefs": [], "itemNames": [], "encounterIds": [] },
  "proposedChecks": [],
  "proposedActions": [],
  "narrativeDirectives": ["acknowledge_player_intent", "stay_in_scene"]
}
\`\`\``);

  if (
    !parsed ||
    parsed.intentType !== "talk" ||
    parsed.judgment !== "allowed" ||
    parsed.targets.npcNames[0] !== "看守员"
  ) {
    throw new Error("❌ adjudication parser 未能正确解析 JSON。");
  }

  const fallback = createFallbackAdjudication();
  if (fallback.judgment !== "clarify") {
    throw new Error("❌ fallback adjudication 默认值错误。");
  }

  console.log("✅ adjudication parser 测试成功：可解析 JSON，并提供保守 fallback。");
}

async function testMockAdjudication() {
  const ai = new AIEngine();
  const context = buildMockContext();

  const blocked = await ai.generateIntentAdjudication("我直接传送到最终决战地，开启决战", context);
  if (blocked.judgment !== "blocked" || blocked.intentType !== "wild_request") {
    throw new Error("❌ mock adjudication 未能保守拦截越界意图。");
  }

  const move = await ai.generateIntentAdjudication("我要走进岗哨", context);
  if (
    move.intentType !== "move" ||
    move.judgment !== "allowed" ||
    move.proposedActions[0]?.type !== "@MOVE"
  ) {
    throw new Error("❌ mock adjudication 未能为合法移动生成候选动作。");
  }

  console.log("✅ mock adjudication 测试成功：保守阻断越界请求，允许合法移动候选。");
}

await testAdjudicationPrompt();
await testAdjudicationParser();
await testMockAdjudication();
