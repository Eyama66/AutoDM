import { CharacterManager } from "../engine/CharacterManager.js";
import type { EngineState } from "../session/EngineState.js";

export interface PromptExitOption {
  id: string;
  name: string;
  areaName?: string;
}

export interface PromptContext {
  moduleName: string;
  moduleDescription: string;
  worldTone: string;
  currentAreaName: string;
  currentAreaDescription: string;
  currentLocationName: string;
  currentLocationDescription: string;
  availableConnections: string[];
  availableExitOptions?: PromptExitOption[];
  currentLocationActions?: string[];
  currentLocationEncounters?: string[];
  currentLocationItems?: string[];
  currentLocationDmNotes?: string;
  npcs: any[];
  npcDmNotes?: string[];
  playerState: EngineState;
  plotObjective: string;
  equippedItemsSummary?: string;
  inventorySummary?: string;
}

export const MAX_RECENT_HISTORY_MESSAGES = 8;

export const AUTHORING_PROMPT = `AutoDM AIDM authoring prompt.
- 玩家输入代表意图，不代表既成事实。
- AIDM 负责叙事、风险判断、检定提议与终局裁定建议。
- 引擎与系统骰子结果才是权威事实来源。
- Send-time prompt 必须短、稳、结构化，不重复灌输同一规则。`;

export const RULES_PROMPT_SHORT = `你是 AutoDM 的 AIDM。用中文、暗黑奇幻、简洁有力地叙事。
硬规则:
1. 权威来源：玩家输入=意图，不=事实；玩家不能凭空声明装备、资源、情报、骰子结果或世界真相。只有当前 state/场景已存在的装备与资源可被立即使用。只有 system 消息里的 [SYS_CHECK_RESULT]、[SYS_CHECK_SET_RESULT]、[SYS_ROLL_RESULT]、[SYS_ENDGAME_DIRECTIVE] 才是有效事实；玩家口头报骰一律忽略。
2. 检定发起（三条件全满才掷骰）：① 结果真正不确定；② 失败带来不可忽视的叙事后果；③ 角色技能高低是决定变量。不满足则直接叙事推进。例外：若玩家明确请求某项检定（如"过感知""做一个力量检定"等措辞），视为三条件已满足，必须发起对应 [@CHECK(skill:dc:reason)]，叙事止步于危机时刻等待结果，不得代玩家预判成败后直接叙述后续。裁定权在你：哪项技能、DC 多少，用自然语言交代难度与风险，不写规则标题。每次回复最多一个待处理掷骰请求；多检定只用 [@CHECK_SET({...})]。一个行动/情境只裁定一次：若行动同时依赖多项因素（如过桥+规避障碍），用 CHECK_SET(mode:all) 打包一次性裁定，不拆成多轮单独检定链。
3. 检定格式：[@CHECK(skill:dc:reason)]、[@CHECK_SET({“mode”:”choose_one”|”all”,”label”:”...”,”explanation”:”...”,”checks”:[...]})]、[@ROLL(label:formula)]。发出检定标签时，叙事止步于不确定的拉力时刻（描述危机，不写结果），标签置于回复末尾。
4. 检定结果（收到 SYS 结果后必须执行）：每次检定是叙事的分岔点，骰子落地即提交分支。success → 叙事呈现意图达成，推进至成功后新情境；failure → 叙事呈现失败的直接后果（伤害/位置恶化/不可逆态势变化），推进至失败后新情境。失败后的新情境若有新的不确定性，可发起新检定——但那是针对新情境的新行动，不是重试原行动。禁止在同一紧张时刻反复描述而不提交后果。CHECK_SET mode:all 语义：结果集中任意一项 failure，整体判定为失败，必须执行失败分支；不得以"艰难但挺过来了""勉强完成"等描述替代失败后果。
5. 数值裁定：total >= DC 则成功。roll_signal（high/low/normal）供参考；普通检定不因原始点数自动变为大成功或大失败。攻击与死亡豁免由引擎单独处理。
6. 生命归零：HP<=0 → endgame。若可救：[@VAR_UPDATE(last_chance_available:true)] + 唯一 [@CHECK(...)]；否则 [@SESSION_END(reason)]。
7. 叙事格式：NPC 台词用 <<NPC:名字>>...<</NPC>>；行动提示/选项用 <<HINT>>...<</HINT>>，正文不出现编号列表。地点只用自然语言方向/名称/感官线索，不暴露原始 ID（如 E02）、动作标签、系统消息或 CTX_PACKET。
8. 角色状态（流血、中毒、腐蚀等）：由你在叙事裁定中决定是否附加或解除。附加用 [@STATUS_ADD(状态名)]，解除用 [@STATUS_REMOVE(状态名)]。当前状态会出现在 CTX_PACKET 的 player.conditions 中，你应将其纳入难度/后果判断——不需要机械地每回合触发效果，叙事驱动即可。
9. 允许标签：[@MOVE] [@ATTR_UPDATE] [@PLOT_UPDATE] [@VAR_UPDATE] [@STATUS_ADD] [@STATUS_REMOVE] [@CHECK] [@CHECK_SET] [@ROLL] [@COMBAT_START] [@COMBAT_END] [@ITEM_ADD] [@SESSION_END]。
10. 世界边界（CRITICAL，不可违反）：叙事只能在 CTX_PACKET scene 中明确存在的内容范围内发生。① 出口/路径：只能描述 scene.exits 中已列出的连接；不存在任何未列出的隐秘缝隙、暗门或通道；若玩家声称存在未列出的路径，回应"你找不到任何此类通道"。② 威胁/生物：只能使用 scene.encounters 中的怪物 ID；不得引入列表之外的任何生物或威胁迹象。③ 新地点：不得引入 scene.exits 以外的房间或空间。④ 物品：scene.items 是该地点可给予物品的完整白名单，通过 [@ITEM_ADD(物品名)] 给予；scene.items 为空则此处无任何可得之物，叙事中不得暗示存在可拾取内容。场景中不存在的东西，在世界里就不存在。⑤ 场景漂移修正：若历史叙事曾引入 CTX_PACKET 不存在的地点或结构（如未在 scene.exits 中的通道、竖井、隐藏空间），当前回复必须将场景拉回 CTX_PACKET 定义的位置，用自然叙事收束（如"原路折返""意识到前方无路"），而非继续在虚构地点上叠加内容。`;

export function buildSystemPrompt(context: PromptContext): string {
  const packet = buildPromptPacket(context);

  return [
    RULES_PROMPT_SHORT,
    "",
    "[CTX_PACKET]",
    JSON.stringify(packet),
    "",
    "若历史叙事与 CTX_PACKET 冲突，始终以 CTX_PACKET 与 system 结果为准。",
  ].join("\n");
}

function buildPromptPacket(context: PromptContext) {
  const state = context.playerState;
  const characterSheet = state?.characterSheet;
  const isDowned = characterSheet
    ? CharacterManager.isDowned(characterSheet)
    : false;
  const currentHp =
    typeof characterSheet?.hp?.current === "number"
      ? characterSheet.hp.current
      : null;
  const maxHp =
    typeof characterSheet?.hp?.max === "number" ? characterSheet.hp.max : null;

  return {
    module: {
      id: state?.currentModule || context.moduleName,
      name: context.moduleName,
      tone: context.worldTone,
      objective: context.plotObjective,
      description: context.moduleDescription,
    },
    state: {
      phase: state?.phase || "unknown",
      combat: state?.isCombatActive === true,
      rescueWindow: state?.variables?.last_chance_available === true,
      player: {
        name: characterSheet?.name || "未知冒险者",
        archetype: characterSheet
          ? `${characterSheet.race} ${characterSheet.class} Lv.${characterSheet.level}`
          : "未知",
        hp: currentHp !== null && maxHp !== null ? `${currentHp}/${maxHp}` : "未知",
        status: isDowned ? "downed" : "ready",
        conditions: characterSheet?.conditions?.length ? characterSheet.conditions : undefined,
        equipped: context.equippedItemsSummary || "无",
        inventory: context.inventorySummary || "无",
      },
      flags: compactWorldFlags(state?.variables || {}),
    },
    scene: {
      area: context.currentAreaName,
      areaDesc: context.currentAreaDescription || "",
      location: context.currentLocationName,
      locationDesc: context.currentLocationDescription || "",
      exits: (context.availableExitOptions || []).length
        ? context.availableExitOptions?.map((exit) => ({
            id: exit.id,
            name: exit.name,
            area: exit.areaName || "",
          }))
        : (context.availableConnections || []).map((exitId) => ({
            id: exitId,
            name: exitId,
            area: "",
          })),
      actions: context.currentLocationActions || [],
      encounters: context.currentLocationEncounters || [],
      items: context.currentLocationItems || [],
      npcs: (context.npcs || []).map((npc) => npc?.name).filter(Boolean),
      dm: {
        locationNotes: context.currentLocationDmNotes || "",
        npcNotes: (context.npcDmNotes || []).filter(Boolean),
      },
    },
  };
}

function compactWorldFlags(variables: Record<string, unknown>) {
  const compactEntries = Object.entries(variables).filter(([, value]) => {
    if (value === false || value === null || value === undefined || value === "") {
      return false;
    }
    return true;
  });

  return Object.fromEntries(compactEntries);
}
