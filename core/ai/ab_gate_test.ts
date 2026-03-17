/**
 * ab_gate_test.ts
 *
 * A/B Gate: Compare legacy / json_object / json_text protocol modes.
 * Runs 5 representative game scenarios through each mode and emits a
 * quantitative + qualitative report.
 *
 * Usage (from AutoDM root):
 *   npx tsx core/ai/ab_gate_test.ts
 *   # or: node --import=tsx/esm core/ai/ab_gate_test.ts
 *
 * Reads credentials from web-client/.env  (VITE_AI_API_KEY, VITE_AI_BASE_URL, VITE_AI_MODEL).
 * Writes the full JSON report to core/ai/ab_gate_report.json.
 *
 * Metrics collected per response:
 *   format           — "json" | "legacy" (from parseAIResponse)
 *   jsonParseSuccess — for json modes: did the model actually return a valid JSON envelope?
 *   actionTagLeak    — any [@ACTION(...)] found inside segment.content (MUST be 0)
 *   segmentCount     — total narrative segments
 *   narrationCount   — narration segments
 *   dialogueCount    — dialogue segments
 *   hintCount        — hint segments
 *   hasProtocolAction— protocol.actionText is non-empty
 *   rawLength        — raw response char count
 *   historyTextLength— historyText char count (what the AI sees next turn)
 *   durationMs       — wall time for this generate() call
 *   error            — exception message if generate() threw
 *
 * Naturalness and fact-drift are INTENTIONALLY left to human review.
 * The raw response for each scenario is printed to stdout and included
 * in the report so you can read them yourself.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { AIEngine } from "./AIEngine.js";
import { parseAIResponse } from "./AIResponseParser.js";
import type { ResponseProtocolMode } from "./promptBuilder.js";
import type { PromptContext } from "./promptBuilder.js";
import { DEFAULT_CHARACTER } from "../engine/DefaultCharacter.js";

// ─── .env loader ──────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath)) return {};
  const result: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    result[key] = val;
  }
  return result;
}

const env = loadEnv(path.resolve(__dirname, "../../web-client/.env"));

// ─── Scenario definitions ─────────────────────────────────────────────────────

/**
 * Base PromptContext shared across all scenarios.
 * Scene: 岗哨入口 — one NPC (看守员), one exit (E02 岗哨内部).
 * knownLocationNames contains 营地广场 and 地下室 which are NOT exits,
 * allowing location-drift and item-boundary tests to be meaningful.
 */
const BASE_CONTEXT: PromptContext = {
  moduleName: "铁脊山的低语",
  moduleDescription: "玩家潜入黑刃佣兵的边境据点，寻找被俘的信使。",
  worldTone: "Dark Fantasy",
  currentAreaName: "黑脊岗哨",
  currentAreaDescription: "荒废的石砌要塞，佣兵把守着每一扇门。",
  currentLocationName: "岗哨入口",
  currentLocationDescription: "一扇铁栅栏门，一个困倦的看守员靠在门柱上。",
  availableConnections: ["E02"],
  availableExitOptions: [{ id: "E02", name: "岗哨内部", areaName: "黑脊岗哨" }],
  currentLocationItems: [],
  currentLocationEncounters: [],
  currentLocationActions: [],
  currentLocationDmNotes: "无令牌者不得通过此门。看守员胆小，愿意被贿赂。",
  npcs: [{ name: "看守员", description: "疲惫的中年男人，手边放着一柄生锈的长矛。" }],
  npcDmNotes: ["看守员不知道信使的下落，但知道队长在岗哨内部。"],
  allowedNpcSpeakerNames: ["看守员"],
  knownLocationNames: ["岗哨入口", "岗哨内部", "营地广场", "地下室"],
  playerState: {
    currentModule: "IRON_RIDGE_001",
    currentAreaId: "BLACK_RIDGE",
    currentLocationId: "E01",
    characterSheet: structuredClone(DEFAULT_CHARACTER),
    party: [],
    plotProgress: [],
    activeQuestIds: ["FIND_MESSENGER"],
    isCombatActive: false,
    variables: {},
    sessionMode: "solo",
    phase: "exploration",
    activeScene: {
      sceneId: "BLACK_RIDGE:E01",
      areaId: "BLACK_RIDGE",
      locationId: "E01",
      tags: ["stealth", "social"],
    },
  },
  plotObjective: "找到被俘的信使伊莲",
  modulePlot: {
    plotTitle: "铁脊山的低语",
    mainObjective: "解救信使伊莲",
    plotPoints: [
      { id: "PP001", title: "通过岗哨入口", status: "active", nextPoints: ["PP002"] },
      { id: "PP002", title: "找到队长的房间", status: "not started" },
    ],
  },
  equippedItemsSummary: "Leather Armor（armor，已装备）；Shortsword（weapon，已装备）；Longbow（weapon，已装备）",
  inventorySummary: "Leather Armor（armor）；Shortsword（weapon）；Longbow（weapon）",
};

interface Scenario {
  id: string;
  description: string;
  input: string;
  inputRole: "user" | "system";
  context: PromptContext;
  /** Optional conversation history to inject (e.g. to set up a post-check scenario). */
  history: { role: string; content: string }[];
}

const SCENARIOS: Scenario[] = [
  {
    id: "S1_explore",
    description: "纯探索 — 只打量环境，无行动意图",
    input: "我仔细打量四周的环境，观察门和守卫的情况。",
    inputRole: "user",
    context: BASE_CONTEXT,
    history: [],
  },
  {
    id: "S2_npc_dialogue",
    description: "NPC 对话 — 向看守员搭话",
    input: "我走向看守员，友善地打了个招呼，问他这里发生了什么。",
    inputRole: "user",
    context: BASE_CONTEXT,
    history: [],
  },
  {
    id: "S3_stealth_check",
    description: "技能检定发起 — 潜行绕过守卫",
    input: "我试图悄悄地绕到守卫身后，从侧面的铁门缝隙中挤进去。",
    inputRole: "user",
    context: BASE_CONTEXT,
    history: [],
  },
  {
    id: "S4_post_check_failure",
    description: "检定失败分支 — 潜行失败后结果",
    input:
      "[SYS_CHECK_RESULT] skill=潜行 total=5 dc=14 outcome=failure roll_signal=low",
    inputRole: "system",
    context: BASE_CONTEXT,
    history: [
      {
        role: "user",
        content: "我试图悄悄地绕到守卫身后，从侧面的铁门缝隙中挤进去。",
      },
      {
        role: "assistant",
        content:
          "你屏住呼吸，贴着潮湿的石墙缓缓移动。看守员的呼吸声就在几步之外，铁门的锈迹在月光下泛出暗红。\n[@CHECK(潜行:14:绕过看守员悄悄进入)]",
      },
    ],
  },
  {
    id: "S5_scene_boundary",
    description: "场景边界 — 玩家试图进入不存在的地下室",
    input: "我推开旁边的木门，走进地下室去找线索。",
    inputRole: "user",
    context: BASE_CONTEXT,
    history: [],
  },
];

// ─── Metrics ──────────────────────────────────────────────────────────────────

interface ScenarioResult {
  mode: ResponseProtocolMode;
  scenarioId: string;
  scenarioDescription: string;
  rawResponse: string;
  format: "json" | "legacy";
  /** For json modes: did the model actually return a valid JSON envelope? */
  jsonParseSuccess: boolean;
  /** Any [@ACTION(...)] found inside segment.content — must always be 0. */
  actionTagLeak: boolean;
  segmentCount: number;
  narrationCount: number;
  dialogueCount: number;
  hintCount: number;
  hasProtocolAction: boolean;
  rawLength: number;
  historyTextLength: number;
  durationMs: number;
  error: string | null;
}

function analyzeResponse(
  mode: ResponseProtocolMode,
  scenario: Scenario,
  rawResponse: string,
  durationMs: number,
  error: string | null,
): ScenarioResult {
  const parsed = parseAIResponse(rawResponse);
  const segments = parsed.renderEnvelope.narrative.segments;

  const jsonParseSuccess =
    mode === "legacy" ? true : parsed.format === "json";

  const actionTagLeak = segments.some((seg) => /\[@[A-Z_]+\(/.test(seg.content));

  return {
    mode,
    scenarioId: scenario.id,
    scenarioDescription: scenario.description,
    rawResponse,
    format: parsed.format,
    jsonParseSuccess,
    actionTagLeak,
    segmentCount: segments.length,
    narrationCount: segments.filter((s) => s.type === "narration").length,
    dialogueCount: segments.filter((s) => s.type === "dialogue").length,
    hintCount: segments.filter((s) => s.type === "hint").length,
    hasProtocolAction: parsed.protocolText.trim().length > 0,
    rawLength: rawResponse.length,
    historyTextLength: parsed.historyText.length,
    durationMs,
    error,
  };
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function runScenario(
  engine: AIEngine,
  mode: ResponseProtocolMode,
  scenario: Scenario,
): Promise<ScenarioResult> {
  const start = Date.now();
  let rawResponse = "";
  let error: string | null = null;

  try {
    rawResponse = await engine.generate(
      scenario.input,
      scenario.context,
      scenario.history,
      { inputRole: scenario.inputRole },
    );
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return analyzeResponse(mode, scenario, rawResponse, Date.now() - start, error);
}

async function runGate(): Promise<void> {
  const apiKey =
    env["VITE_AI_API_KEY"] || env["VITE_DEEPSEEK_API_KEY"] || "";
  const baseURL =
    env["VITE_AI_BASE_URL"] || env["VITE_DEEPSEEK_BASE_URL"] || "https://api.deepseek.com";
  const model = env["VITE_AI_MODEL"] || "deepseek-chat";

  if (!apiKey) {
    console.error(
      "❌ No API key found in web-client/.env (VITE_AI_API_KEY or VITE_DEEPSEEK_API_KEY).",
    );
    process.exit(1);
  }

  console.log(`\n🔬 AutoDM A/B Gate — protocol mode comparison`);
  console.log(`   Model  : ${model}`);
  console.log(`   BaseURL: ${baseURL}`);
  console.log(`   Modes  : legacy | json_object | json_text`);
  console.log(`   Scenarios: ${SCENARIOS.length} × 3 modes = ${SCENARIOS.length * 3} API calls\n`);

  const modes: ResponseProtocolMode[] = ["legacy", "json_object", "json_text"];
  const engines: Record<ResponseProtocolMode, AIEngine> = {
    legacy: new AIEngine({ apiKey, baseURL, model, responseProtocolMode: "legacy" }),
    json_object: new AIEngine({ apiKey, baseURL, model, responseProtocolMode: "json_object" }),
    json_text: new AIEngine({ apiKey, baseURL, model, responseProtocolMode: "json_text" }),
  };

  const allResults: ScenarioResult[] = [];

  for (const scenario of SCENARIOS) {
    console.log(`\n${"─".repeat(72)}`);
    console.log(`Scenario: ${scenario.id} — ${scenario.description}`);
    console.log(`Input   : ${scenario.input}`);

    for (const mode of modes) {
      process.stdout.write(`  [${mode.padEnd(11)}] running...`);
      const result = await runScenario(engines[mode], mode, scenario);
      allResults.push(result);

      const status = result.error
        ? "❌ ERROR"
        : !result.jsonParseSuccess
          ? "⚠ FALLBACK"
          : result.actionTagLeak
            ? "⚠ TAG_LEAK"
            : "✅";

      console.log(
        ` ${status}  ` +
          `fmt=${result.format} segs=${result.segmentCount}` +
          `(n=${result.narrationCount} d=${result.dialogueCount} h=${result.hintCount})` +
          ` proto=${result.hasProtocolAction ? "✓" : "✗"}` +
          ` len=${result.rawLength}c hist=${result.historyTextLength}c` +
          ` ${result.durationMs}ms`,
      );

      if (result.error) {
        console.log(`    ERROR: ${result.error}`);
      } else {
        // Print the raw response indented for human review
        const lines = result.rawResponse.split("\n");
        for (const line of lines) {
          console.log(`    | ${line}`);
        }
      }
    }
  }

  // ─── Aggregated summary ─────────────────────────────────────────────────────

  console.log(`\n${"═".repeat(72)}`);
  console.log("SUMMARY (aggregated across all scenarios)");
  console.log(`${"═".repeat(72)}`);

  for (const mode of modes) {
    const results = allResults.filter((r) => r.mode === mode);
    const total = results.length;
    const errors = results.filter((r) => r.error).length;
    const fallbacks = results.filter((r) => !r.jsonParseSuccess).length;
    const tagLeaks = results.filter((r) => r.actionTagLeak).length;
    const avgLength = Math.round(results.reduce((s, r) => s + r.rawLength, 0) / total);
    const avgHistLen = Math.round(
      results.reduce((s, r) => s + r.historyTextLength, 0) / total,
    );
    const avgDuration = Math.round(results.reduce((s, r) => s + r.durationMs, 0) / total);

    console.log(`\n  Mode: ${mode}`);
    console.log(`    Errors        : ${errors}/${total}`);
    if (mode !== "legacy") {
      console.log(`    JSON fallbacks: ${fallbacks}/${total}  (0 = perfect; >0 = model reverted to free text)`);
    }
    console.log(`    Action tag leaks: ${tagLeaks}/${total}  (0 = perfect; >0 = PROTOCOL VIOLATION)`);
    console.log(`    Avg raw length  : ${avgLength} chars`);
    console.log(`    Avg historyText : ${avgHistLen} chars  (AI memory cost)`);
    console.log(`    Avg duration    : ${avgDuration}ms`);
  }

  // ─── Decision guidance ──────────────────────────────────────────────────────

  console.log(`\n${"─".repeat(72)}`);
  console.log("DECISION GUIDANCE");
  console.log(`${"─".repeat(72)}`);
  console.log(`
  1. Read every raw response above. Confirm naturalness and scene-fact adherence
     are acceptable before committing to a mode change.

  2. json_object: zero-tolerance for fallbacks. If fallback > 0 across 5 scenarios,
     the model cannot reliably produce structured JSON — stay on legacy.

  3. json_text: tolerates one fallback across 5 scenarios (the check-result system
     message case tends to trip structured-output models).

  4. Action tag leak must be 0 for ALL modes. Non-zero means the AI is embedding
     action tags in segment content despite the prompt rule — fix the prompt first.

  5. If json_object fallback=0 AND tag_leak=0 AND naturalness looks good:
     → Set VITE_AI_RESPONSE_PROTOCOL_MODE=json_object as default.
     → Proceed to Phase 7B cutover (validateEnvelopeBoundaries as primary).

  6. If json_object fallback>0 but json_text fallback=0:
     → Use json_text. The local parser handles extraction without forcing API mode.

  7. Full JSON report written to: core/ai/ab_gate_report.json
`);

  // ─── Write JSON report ──────────────────────────────────────────────────────

  const reportPath = path.resolve(__dirname, "ab_gate_report.json");
  const report = {
    timestamp: new Date().toISOString(),
    model,
    baseURL,
    scenarioCount: SCENARIOS.length,
    modeCount: modes.length,
    results: allResults,
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`📄 Full report written to: ${reportPath}\n`);
}

// ─── Entry ────────────────────────────────────────────────────────────────────

runGate().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
