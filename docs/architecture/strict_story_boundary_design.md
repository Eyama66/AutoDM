# AutoDM 严格剧本边界设计与行动计划

这份文档定义 AutoDM 后续如何同时满足两个目标：

1. **DM 能自然、动人、稳定地讲故事**
2. **故事事实严格受限于剧本与权威状态，不随意发明 NPC / 地图 / 道具 / 剧情节点**

本文档默认 AutoDM 是一个长期演进的 **TRPG engine**，必须从一开始就考虑：

- 更大的模组
- 多区域、多剧情线的大冒险
- 单人 / 多人共存
- 可插拔模组
- 长会话与可恢复状态

它**不假定世界规模总是更小**，也不把“先做轻量版、以后再说”当作核心前提。

英文版见 `docs/architecture/strict_story_boundary_design.en.md`。

---

## 1. 设计目标

我们要的不是“把 AI 变成只会照本宣科的朗读器”，而是：

- **叙事自由**
  - 允许 AI 自由发挥语气、描写、节奏、对白风格、镜头感
- **事实封闭**
  - 地点、出口、NPC、可得物品、可触发遭遇、剧情推进条件，全部由权威数据决定
- **运行可验证**
  - 每一条玩家输入、AI 提议、规则校验、状态变更，都能追溯与复现
- **规模可扩展**
  - 大模组、多玩家时不靠把整个世界塞进 prompt

一句话：**措辞可以自由，事实不能自由。**

---

## 1.1 当前阶段边界：前端先做什么，后端后做什么

在当前仓库阶段，我们先明确一条边界：

- **前端现在要做的**
  - 收敛 `PromptContext / AuthorityPacket` 形状
  - 收敛 `IntentAdjudication / AIProposal / EngineEvent` 等契约
  - 完成 UI、消息传输、调试导出、规则结果展示
  - 把浏览器侧状态整理成未来可迁移的 adapter / mock / contract 层
- **后端后面要做的**
  - authoritative `Intent Adjudication`
  - authoritative `Session Runtime`
  - state mutation / reducer / event store
  - multiplayer session / replay / persistence

这意味着：

- 当前前端可以保留 **契约、prompt、mock、shadow mode、调试工具**
- 当前前端**不应该**继续深挖“真正的权威裁定逻辑”
- 所有会决定世界真相的能力，最终都要迁到后端

一句话：**前端现在负责收口接口与体验，后端以后负责拥有真相。**

---

## 1.2 当前前端目标：先把一个剧本按顺序稳定跑完

当前前端阶段的目标，不是处理所有开放输入，而是：

- 先把一个模组按理想顺序稳定跑完
- 先保证 `move / talk / inspect / loot / check / combat / plot` 这些 golden path 能闭环
- 先让前端变成一个 **structured intent -> local resolution -> AI narration** 的顺序运行器

这里要特别强调：

- 这是**当前前端阶段的实现策略**，不是最终的 AI 角色定义
- 当前之所以把 AI 压低到更偏 `narrator` 的职责，是为了先把单模组 golden path 稳定跑通
- 长期目标不是“AI 只复述已裁定结果”，而是让 AI 成为 **受约束的 curator**：在系统给定的合法可能性空间里判断“接下来该发生什么”

因此，当前前端设计遵守下面三条：

1. 玩家自由文本继续保留，但**不是唯一主通道**
2. 前端优先提供 **结构化场景选项**
3. 前端本地只处理 **golden path resolution**，不深挖开放输入 edge case

建议的前端回合顺序：

```text
Scene Options / Player Input
  -> TurnIntent
  -> Local TurnResolution (golden path only)
  -> optional EngineAction apply
  -> NarrationPacket / System Directive
  -> AI Narrator
```

这里的关键是：

- 玩家输入先被收成 `TurnIntent`
- 前端本地先做最小裁定 `TurnResolution`
- AI 在这一阶段主要负责 **讲述已经裁定过的结果**
- 真正开放输入下的 authoritative adjudication 留给后端

当前这条前端 golden path 还需要额外遵守一条运行原则：

- 前端本地已经落地的动作，先写入本地 state，再把结果作为 `System Directive` 交给 AI 叙事
- AI 不应重复发出这些已经落地的动作
- 但 AI 仍然可以基于新情境继续提出 **后继动作**，例如抵达新地点后立刻触发检定、战斗或剧情推进

换句话说：

- 前端负责 **先落已确定的动作**
- AI 负责 **叙述结果，并在必要时提出下一拍**

这样可以同时避免两类问题：

1. AI 把已经执行过的 `MOVE / ITEM_ADD` 再执行一遍
2. 前端为了避免重复执行，粗暴吞掉 AI 后续真正需要的 `CHECK / COMBAT_START / PLOT_UPDATE`

---

## 1.3 当前前端运行架构（已落地）

当前仓库里，已经落地的前端运行结构可以概括为：

```text
React UI
  -> InteractionFooter / free text input
  -> Turn Intent Runtime (golden path only)
  -> CampaignManager
  -> PromptContext Builder
  -> AI Narrator
```

各层当前职责：

- `InteractionFooter / free text input`
  - 提供结构化场景选项与自由文本输入
- `Turn Intent Runtime`
  - 负责本地 `move / talk / inspect / loot` 的最小裁定
  - 对已确定动作先落地，再把结果转成 `System Directive`
- `CampaignManager`
  - 继续承担浏览器内的本地权威状态机
  - 校验 `MOVE / ITEM_ADD / COMBAT_START / PLOT_UPDATE`
- `PromptContext Builder`
  - 从当前 scene authority、plot frontier、角色状态组装最小上下文
- `AI Narrator`
  - 主要负责把已经裁定过的结果讲出来
  - 必要时仍可提出下一拍的检定 / 战斗 / 剧情推进

当前这一层已经具备的能力：

- 结构化场景选项可以驱动单模组的 golden path
- 本地已落地动作会先进入 state，再进入叙事
- 同一场景的物品已加入“领取记账”，不会无限重复拾取
- UI 侧会话派生状态已开始从散落的组件判断收敛为统一 helper

当前仍然保留的限制：

- 浏览器仍是当前阶段的本地权威运行时，不是最终形态
- 开放输入的真正 adjudication 还没后端化
- 多人、回放、版本化 persistence 还没接入

因此，`§1.2 / §1.3` 描述的是**当前战术实现**，而 `§3.6 / §4.3` 描述的是**长期目标模型**。两者不是冲突，而是阶段差异。

---

## 2. 当前系统的边界

AutoDM 目前已经有一个较好的基础：

- `campaignAuthority.ts` 已在加载时编译 SceneGraph（出口、NPC、encounter、item 白名单）
- `campaignPlotUtils.ts` 已实现 PlotFrontier：前置条件校验、allowedNodeIds 计算
- `NarrativeBoundaryValidator.ts` 已覆盖 4 类 action 违规（`@MOVE` / `@ITEM_ADD` / `@COMBAT_START` / `@PLOT_UPDATE`）和基础文本越界检测
- `AIEngine.generateStrictResponse()` 已接入重试循环（最多 2 次）

但仍存在几个关键缺口：

1. **事件触发缺乏条件分支**
   - trigger prototype 已接入，但目前仍主要覆盖 `check_resolved -> combat narrowing`
   - `plot / item` 还没有完整进入同一套 trigger-aware runtime guard
   - `CHECK_SET`、离场清理、持久化恢复等生命周期仍未闭环

2. **AI 角色定位偏差**
   - 当前前端战术实现仍偏 `narrator`
   - 长期目标虽已在文档中收敛为 `curator`，但运行时还未完全迁移到这一模型
   - 尤其是“未枚举战术的开放裁判”还未正式进入 engine contract

3. **possibilitySpace 未显式传递**
   - 这个问题在当前原型里已基本解决
   - 但 `possibilitySpace` 目前仍主要服务于 encounter / item / plot proposal 约束
   - 它还不是 blocker/result-predicate 级别的完整开放裁判上下文

4. **重试循环上下文残缺**
   - 这个问题在当前原型里已修复
   - 当前剩余问题不是“看不到坏回复”，而是 validator 本身仍有部分启发式文本判断

5. **上下文组装还不够分层**
   - 未来大模组下，必须引入”检索式上下文”而不是”全量上下文”

6. **多人/长战役还没有事件级基础设施**
   - 没有真正的 event-sourced state，就难以支持多人同步、回放、精确恢复

所以，当前系统能做到”**动作层面的部分收束**”，但还做不到：
- **故事分支点被剧本严格约束**
- **AI 在合法可能性空间内做 DM 判断**

---

## 3. 核心设计原则

后续实现必须遵守下面几条。

### 3.1 AI 永远不是世界真相的拥有者

- AI 只能输出 **叙事提议** 和 **规则提议**
- 真正的世界状态只能来自：
  - 模组编译后的权威数据
  - 引擎当前 authoritative state
  - 已落地的系统事件

### 3.2 模组先编译，再运行

- 运行时不临时猜测“这个 NPC 是否存在”
- 不临时猜测“这条路线是否应该能走”
- 模组导入时就编译出：
  - 地图连通图
  - plot 依赖图
  - NPC 出场与迁移表
  - encounter 白名单
  - item 来源白名单

### 3.3 小上下文，高权威

- 大模组下，不把整张世界地图原样塞进 prompt
- 只给 AI 当前回合真正需要的权威子集
- 但这个子集必须足够硬，不能模糊

为了避免后续实现时把几个概念混在一起，这里明确三层职责：

| 层 | 职责 | 是否是唯一事实源 |
|---|---|---|
| `World Authority Store` | 编译后的世界事实、规则索引、scene/plot/entity/triggers 数据 | 是 |
| `AuthorityPacket` | 某一回合从权威状态投影出来的“当前必要真相” | 否，是运行时视图 |
| `possibilitySpace` | `AuthorityPacket` 内给 AI 的“当前合法决策集” | 否，是运行时约束子集 |

更具体地说：

- `World Authority Store` 回答“世界里有什么、规则允许什么”
- `AuthorityPacket` 回答“这一回合当前玩家需要知道什么、AI 需要参考什么”
- `possibilitySpace` 回答“AI 此刻可以部署什么、可以推进什么”

### 3.4 规则优先，LLM 校验兜底

- 能用 deterministic 规则判断的，绝不交给 LLM
- LLM validator 只负责：
  - 文本级幻觉
  - 漏动作
  - 剧情/场景语义越界

### 3.5 单人 / 多人共用一套运行时

- 单人只是一个 participant 的 session
- 多人只是多个 participant 的 session
- 不能维护两套不同的世界模型

### 3.6 AI 是策展人，不是创作者，也不是复读机

这是 DM 角色定位的核心原则。有三种可能的 AI 定位：

- **Creator（无约束）**：AI 发明世界事实 → 不可接受，世界会漂移
- **Narrator（纯复读）**：AI 只叙述已裁定的结果 → 丧失 DM 的核心价值
- **Curator（策展人）**：AI 在合法可能性空间内做判断 → 正确定位

DM 真正的工作是：**判断接下来该发生什么，而不是发明可以发生什么。**

具体体现：
- 当前 scene 有 2 个 encounter，AI 决定**什么时机让哪个出现**（策展）
- 当前 plot frontier 有 3 个可推进节点，AI 决定**是否现在揭示**（策展）
- NPC 说什么话、怎么反应，AI 自由创作（叙事自由）
- NPC 是否存在、是否在场，由权威系统决定（事实封闭）

因此，AuthorityPacket 给 AI 的不是"当前已确定的世界"，而是"当前合法的可能性空间"（possibilitySpace）。AI 在这个空间内做 DM 判断，Validator 只检查 AI 是否越出了这个空间。

### 3.7 对事实闭世界，对战术开世界

这是本设计避免 overfit 的关键约束。

- **系统必须强约束的**
  - hard facts：地点、出口、NPC 是否存在/在场、物品是否存在、通信是否可用、角色已知身份/资源
  - forbidden facts：明确不存在的地点、援军、机构权限、隐藏通道、额外掉落
  - blockers / resolved conditions：剧情推进真正依赖的结果条件
  - critical triggers：剧本作者明确关心的关键 scripted 分支
- **系统不应该穷举的**
  - 所有可能的解法路径
  - 所有可能的社会工程、环境利用、谈判策略
  - 所有“可借力的东西”的完整白名单

因此：

- `possibilitySpace` 不是“所有合法战术的完整枚举”
- `triggers` 也不是“覆盖所有玩法的分支树”
- 未被枚举的玩家方案，只要不违背 hard facts，且可能满足 blocker，就应允许 AI 裁判

系统最终验证的不是“这条 path 是否预写过”，而是：

1. 该方案是否违背世界事实
2. 该方案是否依赖玩家合理拥有的资源/身份
3. 该方案是否需要额外检定、代价、时间或后果
4. 若成功，是否足以满足 blocker / resolved condition

一句话：**强约束结果，弱约束路径。**

---

## 4. 目标架构

```text
Module Source
  -> Module Compiler
    -> World Authority Store
    -> Plot Graph / Scene Graph / Entity Registry

Player Input
  -> Session Runtime
    -> Context Assembler
    -> AI DM Adapter
    -> Proposal Parser
    -> Runtime Guards
    -> Narrative Validator
    -> Event Store
    -> State Reducer

Client / Multiplayer Gateway
  -> subscribe to events + snapshots
```

### 4.1 Module Compiler

负责把模组 JSON 编译成可运行的 authority graph。

输出至少包括：

- `SceneGraph`
  - 区域、地点、出口、解锁条件
- `PlotGraph`
  - plot node、前置条件、允许后继、失败分支
- `EntityRegistry`
  - NPC、怪物、物品、道具来源、初始位置
- `SceneTriggerIndex`
  - 每个 scene 的条件分支触发规则（见 §5.4）
  - 按 `{ sceneId → trigger[] }` 索引，运行时快速查找
- `RuleIndexes`
  - encounter whitelist
  - item source whitelist
  - NPC presence rules

### 4.2 World Authority Store

这是整个系统的**唯一事实源**。

它至少要能回答：

- 当前地点有哪些真实出口？
- 当前 plot 允许推进到哪里？
- 哪些 NPC 当前在场？
- 哪些 NPC 只是存在于世界中但不在场？
- 当前 scene 允许触发哪些 encounter？
- 当前地点可能产出哪些 item？
- **当前是否有 active trigger？active trigger 对应哪个分支的 possibilitySpace？**

### 4.3 Context Assembler

运行时只组装一个 **AuthorityPacket**，不给 AI “全世界”，只给它”当前必要真相”。

建议分层：

- `session`
  - mode、participants、current module、revision
- `scene`
  - current area/location、可见出口、在场 NPC、当前遭遇、可得物品
- `plot`
  - 当前活跃剧情、允许后继、阻塞条件
- `party`
  - 角色状态、库存、装备、条件、队伍位置
- `memory`
  - 与当前输入强相关的少量 recent turns / scene summary
- **`possibilitySpace`**（新增，AI 策展决策的核心输入）
  - 当前在 engine 层可部署的 encounter 集合，附带触发提示
  - 当前在 engine 层可推进的 plot node 集合，附带揭示提示
  - 当前在场 NPC 及其可互动能力
  - 当前在 engine 层可被发现的 item
  - 是否有 active trigger 在约束（见 §5.4）

`possibilitySpace` 的构建逻辑：
- **无 active trigger 时**：从 scene 通用白名单派生，AI 自由选择时机
- **有 active trigger 时**：收窄到 trigger 当前分支的 deployable 集合，AI 必须在此范围内部署

这里再强调一次边界：

- `possibilitySpace` 用于约束 **engine action 的合法部署范围**
- 它**不是**玩家战术空间的完整枚举
- 对于列表外但合乎世界事实的方案，AI 仍可进行裁判，只是最终必须落到合法的状态变化上

### 4.4 Runtime Guards

这是 deterministic 的硬护栏。

至少包括：

- `MoveGuard`
  - 校验连接、解锁条件、跨区域规则、多人分队位置
- `PlotGuard`
  - 校验 plot node 是否存在、前置条件是否满足、是否允许推进
- `CombatGuard`
  - 校验 encounter 是否在当前 possibilitySpace.deployableEncounters 内
  - 若有 active trigger：仅允许 trigger 当前分支的 encounterIds
- `ItemGuard`
  - 校验物品来源是否合法、是否重复获取、是否超出数量
- `NpcGuard`
  - 校验 NPC 是否存在、是否在场、是否允许迁移 / 发言 / 加入队伍
- `TriggerGuard`（新增）
  - 检定结果回来后，查找当前 scene 是否有对应 trigger
  - 若有：激活 trigger，写入 active trigger state，收窄 possibilitySpace
  - 若无：不影响通用 possibilitySpace，AI 在白名单内自由策展

### 4.5 Narrative Validator

这是专门约束”文本事实”的一层。

主要职责：

- 检查 DM 文本是否提到了不存在的 NPC（文本级 NPC speaker 校验）
- 检查是否提到了不存在或未解锁的地点 / 通道 / 暗门（location drift 检测）
- 检查是否暗示了不存在的可拾取物
- 检查是否跳过当前 plot 前沿，提前透露不应揭露的信息
- **检查所有 engine action 是否在当前 possibilitySpace 内**（核心校验，deterministic）
- 检查叙事和 action 是否一致

失败时不立刻展示，而是生成结构化 `Error Note` 回灌给主模型重写。

**关于重试上下文**：纠正轮次中，retryHistory 必须包含 AI 上一次的坏回复（作为 assistant 消息）；纠正指令则作为当前轮的 system input 传入。否则 AI 不知道自己写了什么、改什么。

### 4.6 Event Store + State Reducer

要为多人和长战役做准备，状态必须可追溯。

建议的标准链路：

1. `PLAYER_INTENT_SUBMITTED`
2. `AUTHORITY_PACKET_BUILT`
3. `AI_PROPOSAL_RECEIVED`
4. `PROPOSAL_VALIDATED`
5. `ENGINE_EVENT_EMITTED`
6. `STATE_REDUCED`
7. `CLIENT_PATCH_PUBLISHED`

这里补一条实现约束：

- `activeTrigger` 属于**运行时约束状态**，不属于普通世界 flag
- 它不应混放进 `variables: Record<string, unknown>`
- 推荐放在类型化的 session/runtime 字段里，例如 `EngineState.triggerRuntime.activeTrigger`

---

## 5. 关键数据模型

### 5.1 Module Runtime Manifest

建议新增编译产物，而不是运行时直接读原始模组 JSON：

- `compiledSceneGraph.json`
- `compiledPlotGraph.json`
- `compiledEntityRegistry.json`
- `compiledSceneTriggers.json`（新增，见 §5.4）
- `compiledAuthorityIndex.json`

### 5.2 AuthorityPacket

建议结构：

```ts
type AuthorityPacket = {
  session: {
    sessionId: string
    mode: "solo" | "party"
    revision: number
    moduleId: string
  }
  party: {
    members: object[]
    sharedFlags: Record<string, unknown>
  }
  scene: {
    areaId: string
    locationId: string
    exits: { id: string; name: string; unlocked: boolean }[]
    npcIds: string[]
    encounterIds: string[]   // 完整白名单
    itemIds: string[]
    sceneFlags: Record<string, unknown>
  }
  plot: {
    activeNodeIds: string[]
    allowedNextNodeIds: string[]
    blockedNodeIds: string[]
  }
  memory: {
    recentTurns: object[]
    sceneSummary?: object
  }
  // AI 策展决策的合法可能性空间
  possibilitySpace: {
    // 当前可部署的 encounter，AI 决定时机和方式
    deployableEncounters: {
      id: string
      triggerHint?: string       // 给 AI 的叙事提示，不是给玩家的
    }[]
    // 当前可推进的 plot node，AI 决定是否以及如何自然引入
    advancablePlotNodes: {
      id: string
      title: string
      revealHint?: string
    }[]
    // 在场 NPC 及互动能力
    presentNpcs: {
      name: string
      canSpeak: boolean
      canBeInteracted: boolean
    }[]
    // 当前可被发现的 item
    discoverableItems: string[]
    // active trigger 约束（若有）
    activeTrigger?: {
      triggerId: string
      branch: "success" | "failure" | string
      narrativeHint: string
      // 当有 activeTrigger 时，以上 deployable 字段已被收窄为 branch.deployable
      isTriggerConstrained: true
    }
  }
}
```

### 5.3 AIProposal

建议从”直接输出 action 标签”演进成”AI 提议”，然后再由引擎做落地。

建议区分：

- `NarrativeProposal`
  - narration
  - npc speeches
  - hints
- `RulesProposal`（AI 策展判断的产物，全部须经 Validator 对照 possibilitySpace 校验）
  - move
  - check（AI 裁量是否发起，DC 由 SceneTrigger 定义或 AI 建议）
  - combat start（必须在 possibilitySpace.deployableEncounters 内）
  - reward / item add（必须在 possibilitySpace.discoverableItems 内）
  - status add/remove
  - plot progress（必须在 possibilitySpace.advancablePlotNodes 内）

这样更适合后面加 validator 和多模型协作。

---

### 5.4 SceneTrigger（模组数据格式）

SceneTrigger 是模组作者表达”重要分支点”的方式。
它不需要覆盖所有行为，只覆盖**剧本设计的关键时刻**；其余由 AI 在通用 possibilitySpace 内自由策展。

**模组 JSON 格式**：

```json
{
  "locationId": "DARK_CORRIDOR",
  "encounters": ["ENC_SKELETON_AMBUSH", "ENC_SKELETON_ALERT"],
  "triggers": [
    {
      "id": "TRIG_PATROL_AWARENESS",
      "when": "check_resolved",
      "skill": "perception",
      "dc": 14,
      "branches": {
        "success": {
          "narrativeHint": "发现了暗处潜伏的骷髅巡逻队，获得先机",
          "deployable": {
            "encounterIds": ["ENC_SKELETON_ALERT"],
            "plotNodeIds": ["PP_PATROL_SPOTTED"]
          }
        },
        "failure": {
          "narrativeHint": "未能察觉威胁，骷髅队从背后发起突袭",
          "deployable": {
            "encounterIds": ["ENC_SKELETON_AMBUSH"]
          }
        }
      }
    }
  ]
}
```

**运行时语义**：

- `when: “check_resolved”` + `skill` + `dc`：当该技能检定完成时，触发此规则，DC 由模组定义，不由 AI 猜测
- `branches.success / failure`：检定结果映射到对应分支
- `deployable`：该分支下 possibilitySpace 的收窄范围，覆盖 scene 通用白名单
- **trigger 不约束叙事文本本身**，只约束 AI 能提出哪些 engine action

**trigger 的 `when` 类型（按需扩展）**：

| when | 激活条件 |
|---|---|
| `check_resolved` | 技能检定完成后 |
| `player_action` | 玩家提交特定 intent 类型（如 `loot`、`examine`） |
| `enter_scene` | 进入该地点时自动激活 |
| `plot_reached` | 某 plot node 已完成时激活 |

**active trigger 生命周期**：
- 激活 → 写入 session state（`activeTrigger`）
- possibilitySpace 构建时读取，收窄 deployable
- 一旦 AI 输出对应 engine action 并落地 → trigger 消费完毕，状态清除
- 超时或玩家离开 scene → 自动清除

### 5.5 Blocker + Open Adjudication（未来扩展，不做穷举解法）

对于关键剧情约束，长期更推荐补充 **blocker / resolved condition**，而不是补越来越多的 `routes[]` 或 `affordances[]`。

例如：

- 邪教徒必须被清出现场，剧情才能继续
- 系统真正关心的是：`cult_group_present == false`
- 系统**不应该**写死“只能战斗 / 只能说服 / 只能报警”

更适合的数据表达是：

- `hardFacts`
  - 当前现场有没有信号
  - 角色有没有军方/警方权限或联系人
  - 场景里是否真的存在可利用的电闸、出口、监控、证据
- `forbiddenFacts`
  - 当前世界里不存在的援军、地点、资源、机构权限
- `blockers`
  - 如 `BLOCK_CULT_CONTROL`
- `resolvedWhen`
  - 如 `sceneFacts.cult_group_present == false`
- `criticalTriggers`
  - 只覆盖作者真正想强约束的关键分支点

AI 的职责则是：

- 判断玩家提出的方案是否依托当前世界事实
- 判断是否需要检定、代价、时间、后果
- 判断成功后是否足以满足 blocker

这意味着：

- “报警驱散邪教徒”
- “说服邪教首领撤离”
- “调用角色既有军方关系镇压”

这些**不必预写成 route**。只要：

1. 不违背 hard facts / forbidden facts
2. 角色资源与身份支持
3. 裁判结果最终能落到合法状态变化

就应允许 AI 在 DM 裁量下处理。

因此，长期模型不是“穷举所有路线”，而是：

- 用结构化数据锁住 **事实边界与结果条件**
- 把 **未枚举战术** 留给 AI 与玩家的博弈
- 用 validator / reducer 检查最终状态变化是否成立

---

## 6. 大模组 / 多人模式下的扩展策略

### 6.1 不发送全世界，只发送“当前相关世界”

大模组场景下，prompt 必须靠检索，不靠堆料。

默认只取：

- 当前 scene
- 邻接 scene / 可达出口
- 当前 plot frontier
- 当前在场 NPC
- 与当前玩家意图最相关的 3-8 条记忆块

### 6.2 把“NPC 存在”与“NPC 在场”分开

一个大模组里，NPC 可能：

- 存在于世界中
- 当前不在场
- 在别处活动
- 在回忆/传闻中可被提及

因此 validator 必须区分：

- **可被提及**
- **可在场说话**
- **可被交互**

### 6.3 多人状态必须支持分队

多人冒险里不能默认整队永远同地点。

至少要支持：

- party split
- shared inventory rules
- per-player visibility
- per-player prompt differences

这要求 `EngineState` 里保留 participant-level location / visibility / permissions。

---

## 7. 对现有代码的落地点

下面这些文件可以作为第一批改造入口。

### 7.1 Prompt / Context

- `AutoDM/core/ai/promptBuilder.ts`
  - 负责把 `CTX_PACKET` 升级为更严格的 AuthorityPacket 输出
- `AutoDM/web-client/src/gamePromptContext.js`
  - 负责把 plot / item / encounter / NPC presence 真正接进上下文

### 7.2 Runtime Guard

- `AutoDM/core/engine/CampaignManager.ts`
  - 增加 `PlotGuard` / `CombatGuard` / `NpcGuard`
- `AutoDM/core/engine/ActionProcessor.ts`
  - 保留 tag parsing，但逐步从“标签协议”演进到“proposal parsing”
- `AutoDM/core/engine/campaignActionEffects.ts`
  - 所有状态变更必须经 guard 后再 reducer

### 7.3 Session / Persistence

- `AutoDM/core/session/EngineState.ts`
  - 为多人、分队、revision、event replay 留字段
- `AutoDM/web-client/src/gameSessionStorage.js`
  - 后续只做缓存层，不再充当最终 authoritative store

### 7.4 New Components

建议新增：

- `AutoDM/core/authority/`
  - `AuthorityPacket.ts`
  - `ModuleCompiler.ts`
  - `SceneGraph.ts`
  - `PlotGraph.ts`
  - `EntityRegistry.ts`
- `AutoDM/core/validation/`
  - `NarrativeValidator.ts`
  - `ProposalValidator.ts`
- `AutoDM/core/runtime/`
  - `SessionRuntime.ts`
  - `EventStore.ts`
  - `ContextAssembler.ts`

---

## 8. Action Plan

以下行动计划按“前端先收口接口与体验，后端再接管权威运行时”的顺序推进。

### 前端当前优先级

这一阶段只做不会把权威逻辑固化在浏览器内的工作：

1. `PromptContext / AuthorityPacket` 继续收敛
2. `IntentAdjudication / AIProposal / EngineEvent` 契约稳定
3. UI 只消费结构化结果，不继续反向猜规则状态
4. 增加调试导出、回放视图、prompt/packet 可视化
5. 浏览器侧只保留 mock / adapter / shadow mode，不承载最终裁定

### 后端后续优先级

下面这些能力默认视为后端事项：

1. authoritative adjudication
2. authoritative session runtime
3. reducer + event store + persistence
4. multiplayer session / replay / recovery
5. 真正的 AI orchestration 与模型路由

### Phase 0：定义权威模型与术语

目标：

- 明确 `authority / proposal / event / reducer / scene / plot frontier` 的定义
- 补足 TypeScript 类型

交付物：

- `AuthorityPacket` 类型定义
- `CompiledModule` 类型定义
- `EngineEvent` 扩展草案

完成标准：

- 团队内部不再用模糊词描述“状态”与“剧情”

### Phase 1：模组编译器与权威索引

目标：

- 把模组 JSON 编译成运行时 authority graph

交付物：

- `ModuleCompiler`
- `SceneGraph`
- `PlotGraph`
- `EntityRegistry`

完成标准：

- 能从模组数据回答“当前可走哪、谁在场、剧情能推进到哪”

### Phase 2：硬护栏补齐

目标：

- 让非法动作永远无法落地

交付物：

- `MoveGuard`
- `PlotGuard`
- `CombatGuard`
- `ItemGuard`
- `NpcGuard`

完成标准：

- 非法 move / plot / combat / item / npc 更新全部被 deterministic 拦截

### Phase 3：AuthorityPacket 驱动的 Prompt 系统

目标：

- 用检索式上下文替换“尽量多塞点 scene 信息”的做法

交付物：

- `ContextAssembler`
- `AuthorityPacket` 生成逻辑
- `promptBuilder` 升级

完成标准：

- 单回合 prompt 内容稳定、可导出、可复现、可解释

### Phase 4：叙事级 Validator + 自动重试

目标：

- 约束 AI 纯文本中的世界事实

交付物：

- `NarrativeValidator`
- validator prompt
- 失败重试与 `Error Note` 回灌机制

完成标准：

- AI 纯文本胡编 NPC / 地点 / 道具 / plot 线索时，系统可自动拦截并重写

### Phase 5：事件流与多人会话能力

目标：

- 为多人、长战役和服务端化做好底座

交付物：

- `SessionRuntime`
- `EventStore`
- `revision` / replay / snapshot 机制

完成标准：

- 单人 / 多人共享一套引擎运行时
- 支持基于事件流的恢复与调试

### Phase 6：工具链与可观测性

目标：

- 让系统可测、可查错、可持续演进

交付物：

- authority packet snapshot tests
- invalid proposal regression tests
- narrative validator replay fixtures
- prompt export / validator logs

完成标准：

- 能快速定位“AI 为什么越界”

---

## 9. 当前原型状态与下一步

### 9.1 当前已完成的关键能力

- ✅ `campaignAuthority.ts`
  - Scene / NPC / item / encounter / trigger 数据已能在加载时编译
- ✅ `campaignPlotUtils.ts`
  - PlotFrontier 已能计算前置条件与 allowed next nodes
- ✅ `AIEngine.generateStrictResponse()`
  - 重试纠错时已带上上一条坏回复
- ✅ `possibilitySpace`
  - 已进入 `AuthorityPacket` / `CTX_PACKET`
  - prompt 已显式要求 `@COMBAT_START / @ITEM_ADD / @PLOT_UPDATE` 优先服从它
- ✅ `NarrativeBoundaryValidator.ts`
  - combat / item / plot 已优先对照 `possibilitySpace`
  - `ENC_` 模板别名绕过已移除
- ✅ trigger prototype
  - `SceneTrigger` 数据已能编译
  - `CampaignManager.applyCheckResult()` 已能激活 `activeTrigger`
  - `buildPromptContext()` 已能读取 `activeTrigger` 收窄 `possibilitySpace`

### 9.2 当前已经验证的设计方向

当前原型已经能证明下面这条方向成立：

- 系统可以在关键检定分支点收窄 AI 的合法部署空间
- AI 不再只看 scene 原始白名单，而是看“此刻被允许的部署范围”
- 这让“系统约束关键事件，AI 裁量何时以及如何触发”开始可运行

换句话说，当前已经从：

- “AI 会讲故事，动作有一些硬校验，但 AI 不知道自己现在能做什么”

走到：

- “AI 至少在部分关键分支上，已经知道自己此刻能合法部署什么”

### 9.3 当前仍未完全闭环的点

当前原型还不是完整的正式 runtime，主要差距在：

1. `plot / item` 的 runtime guard 还未完整对照 trigger-narrowed `possibilitySpace`
2. `CHECK_SET` 流程还未统一接入 trigger 激活
3. `activeTrigger` 的清理、持久化、恢复链路还不完整
4. 文本级 `location drift` 仍带启发式成分，不应作为长期主约束

### 9.4 当前评估结论

- **如果目标是前端 prototype**
  - 当前实现已经足够验证“关键事件触发靠系统约束，故事叙事与部分裁量交给 AI”的方向
- **如果目标是严格、可恢复、可扩展的正式 runtime**
  - 还需要补齐 blocker / resolved condition、trigger 生命周期、runtime guard 闭环与后端 authoritative runtime

---

## 10. 成功标准

当下面这些场景都能稳定通过时，说明设计开始生效：

**世界事实约束**
1. AI 不会在文本里发明未定义的暗门、地道、密室
2. AI 不会让不在场 NPC 突然发言或出手
3. AI 不会把当前 scene 没有的 item 讲成可捡拾奖励
4. AI 不会跳过 plot prerequisites 直接推进终局

**策展判断与 trigger 约束**
5. 感知检定成功后，AI 只会触发 trigger.success.deployable 内的 encounter，不会触发 trigger.failure 的版本
6. 感知检定失败后，AI 触发偷袭 encounter，而不是发现隐藏怪物
7. 无 trigger 定义的场景，AI 可从通用 encounter 白名单里自由选择时机，不被过度限制
8. AI 可以自主决定现在是不是推进某个 plot node 的好时机（只要它在 possibilitySpace 内）

**运行时可观测**
9. 多人模式下，分队成员不会共享错误视野或错误位置
10. 问题出现时，日志能说明是：
    - authority 数据错误
    - trigger 定义缺失或 branch 配置错误
    - possibilitySpace 构建错误
    - runtime guard 错误
    - validator 误判
    - prompt 约束不足

---

## 11. 最终结论

对 AutoDM 来说，真正可扩展的路线不是“让 prompt 更像 NeverEndingQuest”，而是：

- **让世界先结构化**
- **让 authority 先成立**
- **让引擎先能拒绝非法事实**
- **再让 AI 在合法边界内讲得更好**

这条路线更适合：

- 大模组
- 多人冒险
- 长战役
- 可插拔模组生态
- 后续服务端化

因此，后续所有“如何让 DM 更会讲故事”的工作，都应建立在“世界事实被权威系统锁定”的前提之上。
