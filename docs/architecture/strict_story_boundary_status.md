# AutoDM 严格剧本边界：当前状态

这份文档只描述三件事：

1. 当前原型已经实现了什么
2. 当前还缺什么
3. 接下来最值得做什么

长期设计原则、目标架构和核心模型见 `docs/architecture/strict_story_boundary_design.md`。

---

## 1. 当前已完成的能力

- `campaignAuthority.ts`
  - Scene / NPC / item / encounter / trigger 数据已能在加载时编译
- `campaignPlotUtils.ts`
  - PlotFrontier 已能计算前置条件与 allowed next nodes
- `AIEngine.generateStrictResponse()`
  - 重试纠错时已带上上一条坏回复
- `possibilitySpace`
  - 已进入 `AuthorityPacket` / `CTX_PACKET`
  - prompt 已显式要求 `@COMBAT_START / @ITEM_ADD / @PLOT_UPDATE` 优先服从它
- `NarrativeBoundaryValidator.ts`
  - combat / item / plot 已优先对照 `possibilitySpace`
  - `ENC_` 模板别名绕过已移除
- `moduleContractValidator.ts`
  - 已能校验当前模组的 scene actions、嵌入式 action 标签、trigger deployable 与 plot graph 基本自洽性
- trigger lifecycle（当前原型）
  - `SceneTrigger` 数据已能编译
  - `CampaignManager.applyCheckResult()` 已能激活 `activeTrigger`
  - `@MOVE` 与 `@COMBAT_START` 已会清除 `activeTrigger`
  - `CHECK_SET` 已接入 trigger 激活入口

---

## 2. 当前已经验证的方向

当前原型已经证明下面这条路线成立：

- 系统可以在关键检定分支点收窄 AI 的合法部署空间
- AI 不再只看 scene 原始白名单，而是看“此刻被允许的部署范围”
- 这让“系统约束关键事件，AI 裁量何时以及如何触发”开始可运行

换句话说，当前已经从：

- “AI 会讲故事，动作有一些硬校验，但 AI 不知道自己现在能做什么”

走到：

- “AI 至少在部分关键分支上，已经知道自己此刻能合法部署什么”

---

## 3. 当前仍未完全闭环的点

当前原型还不是完整的正式 runtime，主要差距在：

1. `blocker / resolvedWhen`
   - 还没有正式进入 runtime contract
   - 系统还不会表达“剧情推进依赖什么结果条件”
2. `hardFacts / forbiddenFacts / player resources`
   - 还没有被显式收进统一的裁定上下文
   - 未枚举方案的开放裁判还缺这层基础
3. `possibilitySpace`
   - 目前仍主要约束 encounter / item / plot proposal
   - 还不是 blocker/result-predicate 级别的完整开放裁判上下文
4. trigger 仍偏 `check_resolved`
   - 更多 `when` 类型、更多复杂场景约束还没形成完整 contract
5. 文本事实校验仍部分依赖启发式
   - 当前不应把它当作长期主约束

---

## 4. 测试状态

当前测试状态应按两层理解：

- **规则与生命周期**
  - `test:campaign` 已覆盖移动、物品、plot、combat、trigger 生命周期
- **模组 contract**
  - `test:module-contracts` 已校验当前 `eldora_shadow` 的 plot graph、scene actions、嵌入式 action 标签与 trigger deployable 引用
- **意图裁定契约**
  - `test:adjudication` 可验证基本 schema 与 mock 行为
- **AI loop**
  - `test:ai-loop` 已恢复全绿，当前 prompt contract 与端到端逻辑可回归验证

因此：

- 当前原型在“规则骨架”上已经可用
- 核心 runtime、模组 contract 与 AI loop 已有一条可持续回归的基线

---

## 5. 当前评估结论

- **如果目标是前端 prototype**
  - 当前实现已经足够验证“关键事件触发靠系统约束，故事叙事与部分裁量交给 AI”的方向
- **如果目标是严格、可恢复、可扩展的正式 runtime**
  - 还需要补齐 blocker / resolved condition、开放裁判上下文、runtime contract 与后端 authoritative runtime

---

## 6. 接下来最值得做的事

不建议继续加更多 demo 触发器或样本补丁。更合理的顺序是：

1. 基于当前模组审计，继续清理剩余 contract 缺口（尤其是 `PP001 / PP002 / PP003 / PP004` 的结果条件）
2. 在当前模组上落第一个真实的 `blocker / resolvedWhen` 约束
3. 为 `E03` 这类“发现 / 解锁”场景补一个最小 reveal contract，而不是继续依赖文案
4. 再决定哪些能力应继续留在前端，哪些需要转向后端 authoritative runtime
