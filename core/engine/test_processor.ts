import { ActionProcessor } from "./ActionProcessor.js";

/**
 * 极简单元测试：验证逻辑裁判的眼力与品味
 */
function testActionProcessor() {
  console.log("🚀 开始验证核心逻辑区...");

  // 1. 测试解析能力
  const rawAiOutput =
    "在大门的阴影下，你看守员冷冷地看着你。[@MOVE(E02)] [@ATTR_UPDATE(HP:-2)]";
  const actions = ActionProcessor.parse(rawAiOutput);

  if (
    actions.length === 2 &&
    actions[0]?.type === "@MOVE" &&
    actions[1]?.payload === "HP:-2"
  ) {
    console.log("✅ 动作解析测试：通过 (AI 指令被成功捕捉)");
  } else {
    console.error("❌ 动作解析测试：失败", actions);
  }

  // 2. 测试文本清洗
  const clean = ActionProcessor.cleanText(rawAiOutput);
  if (clean === "在大门的阴影下，你看守员冷冷地看着你。") {
    console.log("✅ 文本清洗测试：通过 (玩家看不到丑陋的标签)");
  } else {
    console.error("❌ 文本清洗测试：失败", clean);
  }

  // 3. 测试路径校验 (这是 NeverEndingQuest 的精髓)
  const mockMap = {
    E01: ["E02"], // E01 只通往 E02
    E02: ["E01", "E03"],
  };

  const validMove = ActionProcessor.validateMove("E01", "E02", mockMap);
  const invalidMove = ActionProcessor.validateMove("E01", "E03", mockMap);

  if (validMove && !invalidMove) {
    console.log("✅ 地理路径校验测试：通过 (成功拦截了瞬移幻觉)");
  } else {
    console.error("❌ 地理路径校验测试：失败", { validMove, invalidMove });
  }

  console.log("🏁 逻辑区验证完毕：完全符合设计预期。");
}

testActionProcessor();
