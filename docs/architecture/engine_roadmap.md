# AutoDM Engine 演进路线图

这份文档定义 AutoDM 接下来的修改方向。目标不是把它继续堆成一个“会讲故事的网页 Demo”，而是把它收敛成一个可扩展、可验证、可承载单人/多人跑团的 TRPG engine。

配套的“严格剧本边界”设计与分阶段落地计划见 `docs/architecture/strict_story_boundary_design.md`。

## 1. 目标

AutoDM 的长期目标：

- 成为一个 **Web-native 的 TRPG runtime**
- 支持 **单人模式** 与 **多人模式**，但底层只维护一套引擎模型
- 让 **AIDM 负责叙事与提议**，由 **引擎负责裁定与状态变更**
- 支持 **长会话记忆**，并在压缩 prompt 的情况下尽可能保留上下文
- 保持 **数据驱动**，让模组、任务、实体和规则可以持续扩展

当前明确不追求的事情：

- 不照着 NeverEndingQuest 长成一个超大 Python 单体
- 不把所有规则问题都外包给 LLM
- 不在现阶段优先做 TTS、图片资源、重型编辑器或复杂 SaaS 能力

## 2. 核心原则

后续所有改动都应遵守下面几条：

1. **AI 永远不直接拥有世界状态**
   - AI 可以提出叙事和动作建议。
   - 只有引擎 reducer / rules kernel 可以真正改写 session state。

2. **真相不压缩，叙述才压缩**
   - HP、位置、物品、条件、任务状态、世界 flags 属于 authoritative state。
   - 这些信息必须结构化保存，不应只存在于 prose summary 中。

3. **单人/多人共用一套 session 模型**
   - 单人模式只是一个 session 内只有 1 个 player。
   - 多人模式只是同一套 session 内有多个 participants。

4. **每一步裁定都必须可追溯**
   - 玩家输入
   - AI 提议
   - 引擎校验
   - 骰子结果
   - 最终状态变更
   这五者要能串成一条可回放的事件链。

5. **上下文组装要分层**
   - 不把整段聊天记录原样塞回模型。
   - 只把当前回合真正需要的层级化上下文送给模型。

## 3. 目标架构

目标架构如下：

```text
Client (Web)
  -> Session Gateway (HTTP / WebSocket)
    -> Session Runtime
      -> Rules Kernel
      -> Event Store / Persistence
      -> Context Assembler
      -> Memory / Summary Pipeline
      -> AI DM Adapter
```

各层职责：

- `Client`
  - 展示叙事、输入意图、显示检定和战斗 UI
  - 不再直接持有权威游戏状态

- `Session Gateway`
  - 接收玩家输入
  - 推送引擎事件和 DM 输出
  - 管理单人/多人房间连接

- `Session Runtime`
  - 维护当前 session state
  - 负责编排 turn/phase/scene/combat
  - 将 AI 提议交给 rules kernel 校验并落地

- `Rules Kernel`
  - 纯规则层
  - 负责移动、检定、伤害、条件、战斗、物品、任务、时间推进

- `Event Store / Persistence`
  - 保存事件流、快照、summary、角色和模组状态
  - 用于恢复、重放和后续分析

- `Context Assembler`
  - 从权威状态、summary、recent turns 中组装 prompt

- `Memory / Summary Pipeline`
  - 在自然边界生成 scene / campaign / entity summaries
  - 管理压缩缓存

- `AI DM Adapter`
  - 负责 prompt、模型调用、response parsing
  - 不负责真正裁定

## 4. 核心数据模型

后续建议围绕以下几个核心对象整理代码。

### 4.1 Session

一个跑团房间或一局游戏。

建议字段：

- `sessionId`
- `mode`: `solo` | `party`
- `moduleId`
- `participants`
- `state`
- `activeSceneId`
- `activeCombatId`
- `revision`

### 4.2 Participant

一个 session 里的参与者。

建议字段：

- `participantId`
- `role`: `player` | `ai_dm` | `npc_agent` | `observer`
- `characterId`
- `connectionState`
- `permissions`

### 4.3 EngineState

权威状态快照。

建议至少包含：

- 当前模组 / 区域 / 地点
- 队伍成员与当前位置
- HP / 条件 / 资源
- inventory / equipped items
- plot progress / active quests
- world flags / time / scene flags
- combat state

### 4.4 EngineEvent

未来应把状态变更统一为事件。

示例：

```ts
type EngineEvent =
  | { type: "PLAYER_INTENT_SUBMITTED"; ... }
  | { type: "AI_PROPOSAL_RECEIVED"; ... }
  | { type: "CHECK_REQUESTED"; ... }
  | { type: "ROLL_RESOLVED"; ... }
  | { type: "MOVE_RESOLVED"; ... }
  | { type: "DAMAGE_APPLIED"; ... }
  | { type: "COMBAT_STARTED"; ... }
  | { type: "QUEST_UPDATED"; ... }
  | { type: "SUMMARY_GENERATED"; ... }
```

### 4.5 AIProposal

AI 输出不再直接等于“已执行动作”，而是提议。

建议区分：

- `NarrativeProposal`
  - `NARRATE`
  - `NPC_SPEAK`
  - `HINT`

- `RulesProposal`
  - `PROPOSE_CHECK`
  - `PROPOSE_SAVE`
  - `PROPOSE_MOVE`
  - `PROPOSE_COMBAT_START`
  - `PROPOSE_DAMAGE`
  - `PROPOSE_REWARD`
  - `PROPOSE_FLAG_CHANGE`

### 4.6 ContextPacket

送给 AIDM 的上下文包。

建议结构：

```ts
type ContextPacket = {
  rulesPromptShort: string
  authoritativeState: object
  activeSceneSummary: object | null
  campaignSummary: object | null
  openThreads: object[]
  relevantEntityMemories: object[]
  recentTurns: object[]
  currentInput: object
}
```

## 5. Prompt 系统、压缩与长记忆策略

这部分要明确借鉴 NeverEndingQuest 的“分层上下文、边界摘要、发送时压缩、hash cache”，但不照搬它那种每轮重建大量系统块的重型 runtime。

目标不是把 prompt 文案写短，而是让 **每轮送给模型的内容更少、更稳、更可解释**。

### 5.1 设计目标

Prompt 系统后续必须同时满足：

- **低 token**
  - 当前回合不需要的信息不要进 prompt
- **高保真**
  - authoritative state 不因压缩而丢失或漂移
- **可调试**
  - 每轮送给模型的 `ContextPacket` 必须可导出、可复现
- **可缓存**
  - 没变化的 summary / memory block 不要重复生成
- **可迁移**
  - 前端本地 runtime 和未来服务端 runtime 使用同一套 prompt 组装逻辑

### 5.2 Prompt 系统分层

后续把 prompt 分成三类，而不是每轮直接拼一整块自然语言。

1. `Authoring Prompt`
   - 人类可维护的完整规则文档
   - 用于开发、测试、审查 prompt 设计
   - 不直接完整发送给模型

2. `Send-time Rules Prompt`
   - 真正进模型的短规则提示
   - 手工压缩，保持稳定，不在每轮动态总结
   - 只保留：
     - 身份与叙事职责
     - 输出协议
     - 裁定边界
     - 核心动作/检定/终局规则

3. `Context Packet`
   - 每轮动态组装
   - 只承载当前回合需要的状态、摘要、最近消息和输入

### 5.3 ContextPacket 设计

后续建议收敛到：

```ts
type ContextPacket = {
  rulesPromptShort: string
  authoritativeState: object
  activeSceneSummary: object | null
  campaignSummary: object | null
  openThreads: object[]
  relevantEntityMemories: object[]
  recentTurns: object[]
  currentInput: object
}
```

其中：

- `rulesPromptShort`
  - 固定短规则，不含大量重复 prose
- `authoritativeState`
  - 当前真实状态快照
  - 必须结构化
- `activeSceneSummary`
  - 当前地点或当前场景的摘要
- `campaignSummary`
  - 模组/章节级长期摘要
- `openThreads`
  - 仍待解决的线索、风险、未取物品、未完成承诺
- `relevantEntityMemories`
  - 当前相关 NPC / 地点 / 阵营 /任务线记忆卡
- `recentTurns`
  - 最近少量原始消息
- `currentInput`
  - 玩家意图或系统通知

### 5.4 上下文组装顺序

每轮组装建议固定为：

```text
[RULES_PROMPT_SHORT]
[AUTHORITATIVE_STATE]
[ACTIVE_SCENE_SUMMARY]
[OPEN_THREADS]
[RELEVANT_ENTITY_MEMORIES]
[RECENT_TURNS]
[CURRENT_INPUT]
```

原因：

- 先给规则边界，再给真实状态
- 再给场景级和长期级记忆
- 最后才给最近聊天与当前输入
- 这样模型优先读到“真相”，而不是先被聊天 prose 带偏

### 5.5 输入 token budget 原则

后续不再只靠“最近 15 条消息”这种硬切。[现状参考：AIEngine 仅做 history slice]

预算原则建议：

- 总上下文预算中，至少预留 **30-40%** 给模型输出
- 剩余输入预算按优先级消耗：
  1. `rulesPromptShort`
  2. `authoritativeState`
  3. `activeSceneSummary`
  4. `openThreads`
  5. `relevantEntityMemories`
  6. `recentTurns`

建议的默认上限：

- `rulesPromptShort`: 固定短文本，尽量不超过单轮输入预算的 `10-15%`
- `authoritativeState`: 不超过 `15-20%`
- `scene + campaign summaries + open threads + memories`: 合计不超过 `25-30%`
- `recentTurns`: 尽量控制在 `20-30%`

如果预算不足，裁剪顺序必须是：

1. 先裁 `recentTurns`
2. 再裁 `relevantEntityMemories`
3. 再裁 `campaignSummary`
4. 绝不裁掉 `rulesPromptShort` 与 `authoritativeState`

### 5.6 authoritativeState 的压缩规则

不要把真相写成长 prose。应尽量送结构化、短字段的状态快照。

建议：

- 只送当前回合相关字段
- 不送整包角色卡、整包世界变量、整包物品列表
- 当前状态快照应优先包含：
  - `moduleId / areaId / locationId`
  - `phase / combat flags / pending resolution`
  - 当前角色的 `hp / conditions / key resources`
  - 已装备物品
  - 场景相关物品
  - 当前相关 `world flags`
  - 当前相关任务状态

不建议继续做法：

- 把完整状态用自然语言长段落复述
- 把全部 inventory / 全部 flags / 全部 NPC 备注每轮重发

### 5.7 系统通知的紧凑协议

现在系统检定与掷骰回写仍然偏长，后续要收敛成紧凑格式。

目标：

- 系统回写结果应是 **短、稳定、结构化**
- 不再反复用自然语言教模型“这是权威结果”

建议示例：

```text
[SYS_CHECK_RESULT]
kind=single
skill=感知
dc=14
roll=13
total=13
outcome=failure
reason=夜风与铁门震颤掩盖细小声响
intent=观察黑影来源
```

```text
[SYS_CHECK_SET_RESULT]
mode=all
label=脱离死尸拖拽
results=运动:失败:10/13|杂技:成功:16/13
```

```text
[SYS_ROLL_RESULT]
label=短剑伤害
formula=1d6+DEX
total=7
breakdown=1d6(4)+DEX(+3)
```

要求：

- 系统消息短而固定
- 玩家口头报骰无效这一条只放在 `rulesPromptShort`，不要每次重复写大段说明

### 5.8 Summary 触发点

建议只在自然边界生成 summary：

- 离开地点
- 战斗结束
- 长休结束
- 任务状态变化
- 模组切换
- 会话结束

不要做法：

- 每轮都让模型总结上一轮
- 每次发请求前都重写所有 summary

### 5.9 Summary 结构建议

建议 summary 先以结构化 JSON 存，再决定是否渲染成 prose。

示例：

```json
{
  "kind": "scene_summary",
  "sceneId": "THORN_VILLAGE:E01",
  "visibleFacts": [],
  "hiddenDmTruth": [],
  "stateChanges": [],
  "itemsChanged": [],
  "npcAttitudeChanges": [],
  "openThreads": [],
  "resolvedThreads": []
}
```

关键点：

- `visibleFacts` 和 `hiddenDmTruth` 必须分开
- `stateChanges` 不能省略
- `openThreads` 要能直接喂回模型
- summary 只压叙述，不替代 authoritative state

### 5.10 压缩缓存

建议所有 summary / memory block 都做 hash cache。

基本规则：

- 输入事件集和源状态不变，就不重复生成 summary
- 生成过的 summary block 可复用
- 回合上下文组装时只取相关 block，不重算旧块
- `rulesPromptShort` 是静态资源，不参与每轮重算

### 5.11 可借鉴 NeverEndingQuest 的点

可以借：

- 发送时替换为短规则 prompt
- section-level hash cache
- location / module transition summary
- 增量压缩最近会话段
- 模型路由

不建议照搬：

- 巨型 `@TAG` DSL 原文
- 每轮注入大量 world atlas / plot / archive 块
- OpenAI 依赖的重型压缩链路
- “所有事都靠额外 AI 再压一遍”的架构

### 5.12 当前 AutoDM 的近期 prompt 改造顺序

在真正做长记忆前，建议先做这几步：

1. 把当前 `AIEngine` 的长 system prompt 拆成 `Authoring Prompt + rulesPromptShort`
2. 把系统检定/掷骰回写收成紧凑协议
3. 把 `recentTurns` 从“最近 15 条消息”改成“最近 4-6 条 + summary”
4. 把 `buildPromptContext()` 改成真正输出 `ContextPacket`
5. 再实现 `scene_summary`、`campaign_summary` 和 hash cache

## 6. 分阶段实施计划

下面的顺序是调整后的推荐执行顺序。原则是：

- 先把 `core`、契约层和前端 adapter 收口
- 让浏览器承担 **client / mock / debug / adapter** 职责，而不是最终权威 runtime
- 等 AI 合约、事件模型和上下文契约稳定后，再做真正的后端承接

这意味着：

- 现阶段不再继续让 React 组件直接决定游戏状态
- 也不继续把“真实裁定逻辑”深挖在前端里
- 后端迁移不是“以后再想”，而是默认目标承载位置

### Phase 0: 基线收紧

目标：

- 明确客户端、引擎、AI 的边界
- 停止继续把 React UI 层当成权威 runtime
- 允许浏览器临时承载一套“本地权威 runtime”

工作项：

- 为 `core/` 明确拆出 `engine`, `session`, `memory`, `ai` 的边界
- 定义 `Session`, `EngineState`, `EngineEvent`, `AIProposal`, `ContextPacket` 类型
- 把当前 `CampaignManager` 的职责写清楚：哪些保留，哪些后续迁移
- 记录当前已支持动作和未支持动作，避免协议继续发散

验收标准：

- 核心类型文档和代码类型定义存在
- 当前运行链路可以映射到上述核心对象
- 后续改动不再新增“临时状态字段”而不入模型
- UI 组件不再直接承担引擎裁定职责

当前玩家侧掷骰协议：

- `@CHECK(skill:dc:reason)`
  - 单一检定
  - AI 必须自己判断是否需要检定，并解释为什么这里存在失败风险、为什么是这个 DC
- `@CHECK_SET({...})`
  - 多重检定包
  - `mode="choose_one"`: 玩家从多种解法里选一种来掷
  - `mode="all"`: 多个检定全部结算，允许部分成功、部分失败
- `@ROLL(label:formula)`
  - 伤害、治疗或其他系统数值骰
- 玩家口头声称“我投了几点”“我修正值是多少”不算权威结果
- 只有系统通知回写给 AI 的骰子结果才是有效事实

### Phase 1: 事件化引擎内核

目标：

- 让状态变化从“直接 mutation”变成“事件 + reducer”

工作项：

- 给 `CampaignManager` 增加事件输出层
- 把 `@MOVE`, `@CHECK`, `@ROLL`, `@VAR_UPDATE`, `@COMBAT_START`, `@COMBAT_END` 收敛为明确事件
- 增加统一 reducer / dispatcher
- 让系统骰子、移动、任务更新都能回放

验收标准：

- 同一回合的状态变化可序列化为事件列表
- 给定同一初始 state + 同一事件序列，结果完全一致
- 关键逻辑能脱离 UI 单独测试

### Phase 2: 前端 Session Adapter / Shadow Runtime

目标：

- 在浏览器内先跑通一套 adapter / mock / shadow 形态
- 让前端页面只通过 gateway / adapter 和结构化 state 交互

工作项：

- 把 `pending resolution`、战斗态、终局态等待处理状态纳入 `EngineState`
- 引入最小 `LocalSessionGateway` / adapter
- 让 UI 通过事件和 state snapshot 驱动，而不是直接拼“最后一条 DM 消息”
- 用本地快照 + 事件流支撑 save/load/replay / debug

验收标准：

- 浏览器刷新后可以恢复同一局的本地会话状态
- React 组件不再自行推断 pending check / pending roll 这类核心状态
- 前端 adapter 已经具备未来迁移到服务端的形状

### Phase 3: AI 合约改造

目标：

- 让 AI 成为提议者，不是状态改写者

工作项：

- 重新设计输出协议：`NarrativeProposal + RulesProposal`
- AI 只能请求检定、建议战斗、建议奖励，不能直接发生成事实
- 引擎对 proposal 做校验和落地
- 明确 public facts / hidden facts 的注入方式

验收标准：

- AI 输出不能直接让物品、伤害、任务状态无验证生效
- 玩家胡说的装备、数值、剧情结论不会直接混进权威状态
- 关键 proposal 均有验证层

### Phase 4: Memory & Context Assembler

目标：

- 建立可持续的长会话记忆系统

工作项：

- 将 `Authoring Prompt` 与 `rulesPromptShort` 分离
- 建立 send-time prompt 组装流程
- 实现 `ContextPacket` assembler
- 将系统检定/伤害/终局通知收敛为紧凑协议
- 建立 `scene_summary`, `campaign_summary`, `entity_memory`, `open_threads` 数据结构
- 在自然边界生成 summaries
- 引入 hash cache
- 为 prompt 设 token budget 和裁剪顺序

验收标准：

- 长会话不需要依赖完整原始聊天记录
- 模型可在压缩上下文下保持任务、物品、NPC 关系连续性
- ContextPacket 可调试、可导出、可复现

### Phase 5: 单人模式完整闭环

目标：

- 把 solo 模式打磨成一个真正稳定的 local-first vertical slice

工作项：

- 补完 exploration -> check -> combat -> reward -> save/load 的完整链路
- 把 `module_plot.json` 正式接入 runtime
- 提供恢复、重连、回放和调试工具
- 打磨玩家可见 UI：显式 DC、检定拆解、大成功/大失败反馈、自然语言方向提示，并为后续地图组件预留状态接口

验收标准：

- 一段完整单人冒险可连续跑完，不靠人工修状态
- 每一步裁定都能解释：为什么要检定、为何成功、为何更新任务
- 存档和恢复不破坏战斗、任务和世界状态

### Phase 6: 后端迁移与服务端权威化

目标：

- 把已经稳定的本地 runtime 迁移为真正的 server-authoritative runtime

工作项：

- 新建最小 `server/` session runtime
- 将 `EngineState + EngineEvent + reducer + AI adapter` 迁入服务端
- Web 客户端改为通过 API / WebSocket 发送输入与接收事件
- 将存档从 `localStorage` 逐步迁到服务端快照 / 事件流

验收标准：

- 刷新页面不会丢掉权威 session
- 浏览器不再持有最终裁定权
- 同一个 session 可以被同一用户重新连接恢复
- 前端与服务端共享同一套 core runtime 逻辑

### Phase 7: 多人 Party 模式

目标：

- 同一 session 支持多个玩家共同跑团

工作项：

- participant / permission / turn ownership 模型落地
- 支持 party chat、轮流输入、集体决策、战斗回合控制
- AIDM 能处理“队伍发言”和“个体发言”的区别
- UI 侧加入 session 成员视图和当前行动权展示

验收标准：

- 两个及以上玩家可稳定接入同一 session
- 非当前行动人不能非法推进战斗或世界状态
- AIDM 能区分“谁说了什么、谁正在行动”

### Phase 8: 模组与创作工具

目标：

- 让 AutoDM 真正可扩展

工作项：

- 将 `module_manifest`, `module_plot`, `area`, `entity` 规范整理成可校验 schema
- 增加 loader / validator
- 把模组运行与具体 `eldora_shadow` 解耦
- 后续再考虑 editor / builder

验收标准：

- 新模组可被 loader 正常识别和运行
- schema 校验可提前发现数据不一致
- 前端和 runtime 不再硬编码单一模组路径

## 7. 建议的近期执行顺序

如果按“每次做一小步”的方式推进，并且坚持“前端先做完整，后端后迁移”，建议顺序如下：

1. **先完成 `CampaignManager` 事件化**
   - 先不大改功能，但要让当前流程吐出 `EngineEvent`

2. **再把 pending resolution 纳入 `EngineState`**
   - 不再从最后一条 DM 消息反推核心待处理状态

3. **然后做本地 session gateway / adapter**
   - 让前端 UI 只消费 snapshot 和 events

4. **再做 AIProposal 合约**
   - 把当前 action tag 逐步整理成叙事类 / 提议类 / 引擎执行类

5. **再做 prompt 系统收敛**
   - 拆出 `rulesPromptShort`
   - 把系统通知改成紧凑协议
   - 明确 ContextPacket 的组装顺序和 token budget

6. **再做 memory schema + context assembler**
   - 先做 scene summary 和 campaign summary 两层

6. **最后再迁移到最小 server runtime**
   - 这时后端接管权威裁定与状态落地，前端保留 adapter / UI 职责

这个顺序的好处是：

- 不会一上来陷入多人复杂度
- 不会太早把不稳定逻辑固化进后端
- 不会先写一堆 prompt 再返工 runtime
- 能先得到一个“契约边界清晰、前端职责收口”的新基线

## 8. 近期不要做的事情

为了避免项目长歪，以下几件事建议后放：

- 不要现在就在前端里做深的 authoritative adjudication / reducer 编排
- 不要现在就做复杂的 AI 自动内容生成器
- 不要现在就引入完整的模组编辑器
- 不要先做大而全的战役 SaaS 账户体系
- 不要把所有状态问题都试图交给 prompt engineering 解决
- 不要继续让 UI 层直接持有或推断权威状态

## 9. 第一阶段的可执行 TODO

按当前进度，下一轮开始时，建议直接做下面这组最小变更：

1. 给 `CampaignManager` 增加正式的事件输出接口
2. 让 `@MOVE / @CHECK / @CHECK_SET / @ROLL / @VAR_UPDATE / @COMBAT_* / @SESSION_END` 都能生成 `EngineEvent`
3. 在 `EngineState` 中新增 `pendingResolution` 一类的待处理状态，而不是从 DM 文本反推
4. 设计 `scene_summary` 和 `campaign_summary` 的 JSON schema
5. 新建最小 `ContextPacket` assembler 文档和代码骨架
6. 为将来的本地 gateway / server gateway 预留统一接口

当这几件事做完，AutoDM 就会从“有 engine 骨架的 POC”进入“本地权威 runtime 成型的 POC”阶段。  
之后再做后端迁移，会顺很多。
