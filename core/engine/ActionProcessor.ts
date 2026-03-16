/**
 * AutoDM 核心动作接口
 * 定义 AI 输出中允许被解析的离散动作
 */
export type ActionType =
  | "@MOVE" // 地理移动：[@MOVE(LocationID)]
  | "@PLOT_UPDATE" // 剧情更新：[@PLOT_UPDATE(PlotPointID)]
  | "@ATTR_UPDATE" // 属性变更：[@ATTR_UPDATE(HP:-5)]
  | "@ITEM_ADD" // 获得物品：[@ITEM_ADD(ItemName)]
  | "@INIT_COMBAT" // 开启战斗：[@INIT_COMBAT(EnemyID)]
  | "@COMBAT_START" // 战斗开始：[@COMBAT_START(EnemyID)]
  | "@ATTACK" // 攻击：[@ATTACK(TargetID:Damage)]
  | "@COMBAT_END" // 战斗结束：[@COMBAT_END]
  | "@VAR_UPDATE" // 变量更新：[@VAR_UPDATE(VarName:Value)]
  | "@STATUS_ADD" // 附加角色状态：[@STATUS_ADD(流血)]
  | "@STATUS_REMOVE" // 解除角色状态：[@STATUS_REMOVE(流血)]
  | "@CHECK" // 发起检定：[@CHECK(SkillName:DC)]
  | "@CHECK_SET" // 多检定：[@CHECK_SET({...})]
  | "@ROLL" // 发起数值掷骰：[@ROLL(Label:Formula)]
  | "@SESSION_END" // 本局结束：[@SESSION_END(Reason)]
  | "@NARRATE"; // 纯叙事 (隐式默认)

export const SUPPORTED_ACTION_TYPES: readonly ActionType[] = [
  "@MOVE",
  "@PLOT_UPDATE",
  "@ATTR_UPDATE",
  "@ITEM_ADD",
  "@INIT_COMBAT",
  "@COMBAT_START",
  "@ATTACK",
  "@COMBAT_END",
  "@VAR_UPDATE",
  "@STATUS_ADD",
  "@STATUS_REMOVE",
  "@CHECK",
  "@CHECK_SET",
  "@ROLL",
  "@SESSION_END",
  "@NARRATE",
];

export interface ParsedAction {
  type: ActionType;
  payload: string;
  originalTag: string;
}

/**
 * ActionProcessor: 逻辑裁判
 * 负责解析 AI 的 Raw Text，提取动作并进行合法性校验
 */
export class ActionProcessor {
  private static readonly parsedTagRegex = /\[(@[A-Z_]+)(?:\(([\s\S]*?)\))?\]/g;
  private static readonly looseProtocolTagRegex = /\[@[A-Z_]+(?:\([\s\S]*?\))?\]/g;

  /**
   * 解析文本中的所有指令标签
   * 格式: [@ACTION(PAYLOAD)]
   */
  static parse(text: string): ParsedAction[] {
    const actions: ParsedAction[] = [];
    let match;

    this.parsedTagRegex.lastIndex = 0;

    while ((match = this.parsedTagRegex.exec(text)) !== null) {
      actions.push({
        type: match[1] as ActionType,
        payload: match[2] || "",
        originalTag: match[0] || "",
      });
    }

    return actions;
  }

  /**
   * 对动作进行语义与地理校验 (Arbiter Logic)
   */
  static validateMove(
    currentLocationId: string,
    targetLocationId: string,
    connectivityMap: Record<string, string[]>,
  ): boolean {
    const connections = connectivityMap[currentLocationId] || [];
    return connections.includes(targetLocationId);
  }

  /**
   * 过滤并清除叙事中的标签，返回纯净的显示文本
   */
  static cleanText(text: string): string {
    return text
      .replace(this.looseProtocolTagRegex, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
}
