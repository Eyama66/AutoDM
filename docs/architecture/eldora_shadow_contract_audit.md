# `eldora_shadow` 剧情契约审计

这份文档只审计当前模组数据是否与当前引擎 contract 一致。

审计范围：

- `module_plot.json`
- `areas/*.json`
- 当前支持的 action 协议
- 当前 trigger / plot / scene / variable 的落地关系

目标不是改写剧本，而是识别：

- 哪些剧情条件没有真正数据化
- 哪些 plot trigger 和 scene 数据对不上
- 哪些 scene 描述已经超出了当前引擎能稳定执行的 contract

---

## 1. 总体结论

`eldora_shadow` 当前仍然更像一个 **叙事草案 + 局部结构化模组**，还不是完全自洽的“可严格执行剧本”。

它已经有：

- 明确的 plot 主线
- 基本 scene graph
- 一部分 item / encounter / trigger 数据

这一轮已完成的清理：

- `module_plot.json` 已改成当前引擎真正会消费的 `nextPoints / prerequisites`
- 明显漂移的 scene `actions[]` 已收敛到当前支持协议
- `WHISPERING_CATACOMBS` 中与真实 encounter ID 不一致的说明已修正
- 已新增 module contract validator，用来阻止同类问题继续积累

当前仍然缺：

- plot gate 与真实 scene 结果条件的对齐
- “发现 / 解锁 / 谈判 / 情报收集”这类剧情动作的结构化落点

换句话说：

- 这个模组已经足够支撑当前前端 golden path
- 但还不足以支撑“系统严格约束结果，AI 裁判开放式手段”的下一阶段

---

## 2. 关键问题清单

### 2.1 `PP001` 仍缺少真正的结果条件

文件：

- `data/modules/eldora_shadow/module_plot.json`
- `data/modules/eldora_shadow/areas/THORN_VILLAGE.json`

问题：

- `PP001` 的描述允许多条路：
  - 正面对抗看守
  - 帮看守找勋章
  - 走排水管潜入
- 当前虽然已通过 scene `dmNotes` 补了 `[@PLOT_UPDATE(PP001)]` 的落点
- 但引擎里仍没有统一的“已进入岗哨内部”结果条件

影响：

- 现在只是把推进契约写回了 scene notes
- 还没有把多路径汇聚到同一个 result predicate

建议：

- 后续应改成一个结果条件，例如“已进入岗哨内部”之类的 blocker / resolved condition

### 2.2 `E06` 潜入路径仍只是 scene-level contract，不是统一结果约束

文件：

- `data/modules/eldora_shadow/areas/THORN_VILLAGE.json`

问题：

- `E06` 的 `dmNotes` 现在已经明确：
  - 敏捷检定成功 -> `[@MOVE(E02)] [@VAR_UPDATE(discovered_sewer:true)]`
  - 进入广场后可推进 `[@PLOT_UPDATE(PP001)]`
- 但这仍是“场景说明驱动”，不是统一的结果状态

影响：

- 当前 contract 已能跑通
- 但“潜入成功”仍没有抽象成后续可复用的结果条件

建议：

- 后续应表达“玩家已绕过岗哨门禁并进入内部”

### 2.3 `E03` 被描述成“需发现”，但连接是静态存在的

文件：

- `data/modules/eldora_shadow/areas/THORN_VILLAGE.json`

问题：

- `E03` 的 `dmNotes` 说必须通过感知或审问看守才能发现
- 但 `E02.connections` 已直接包含 `E03`

影响：

- 当前引擎会把 `E03` 当作天然可达地点
- “发现密道入口”并没有真正数据化为 unlock / reveal 条件

建议：

- 要么把 `E03` 设计成默认存在，不再强调“必须发现”
- 要么未来引入 `visibleIf / unlockedIf / revealOnSuccess` 一类结构，真正约束它

### 2.4 `PP002` 已从 dead trigger 改成顺序 plot node，但结果语义仍不够具体

文件：

- `data/modules/eldora_shadow/module_plot.json`
- `data/modules/eldora_shadow/areas/THORN_VILLAGE.json`

问题：

- `PP002` 现在已改成当前引擎可执行的顺序 plot node
- `E04 / E05` 也都补了推进 `[@PLOT_UPDATE(PP002)]` 的 scene-level contract
- 但“哪种情报算完成调查”仍然是叙事判断，不是显式结果条件

影响：

- 当前可以跑通
- 但系统仍不会表达“已获取足够情报”这个结果本身

建议：

- 后续把 `PP002` 改成与“情报收集完成”直接对应的结果条件

### 2.5 `E04 / E05` 目前缺少与 `PP002` 对齐的结构化结果

文件：

- `data/modules/eldora_shadow/areas/THORN_VILLAGE.json`

问题：

- `E04` 现在已经补了 `@CHECK(调查:12)`，`E05` 也都在 `dmNotes` 中补了推进 `[@PLOT_UPDATE(PP002)]` 的 scene-level contract
- 但两处仍然只是把“调查成功 -> 可以推进剧情”写在说明里，没有把“情报已足够”写成显式结果状态
- `E05` 仍把“药剂残渣中的线索”与 `@ITEM_ADD(劣质治疗药水)` 混在同一段叙事里，情报结果和物品结果没有分离

影响：

- `PP002` 叙事上要求玩家在药剂店或地下室找到关键线索
- 当前数据已经能跑通 `PP002`
- 但系统仍然不能表达“残页线索 / 药剂线索 / 足够情报”这些中间结果本身

建议：

- 后续把 `PP002` 相关调查拆成更明确的结果 contract，例如：
  - plot progress 直接推进
  - world variable（如 `barracks_notes_found` / `apothecary_clue_found`）
  - 或单独的 lore/result 节点
- 关键是只选一种主语义，不要同时把“调查结果”混在 plot note、物品奖励和氛围叙事里

### 2.6 `PP003` 与 `C02` 的 NPC 互动还没有数据化

文件：

- `data/modules/eldora_shadow/module_plot.json`
- `data/modules/eldora_shadow/areas/WHISPERING_CATACOMBS.json`

问题：

- `PP003` 要求与幽灵祭司互动，并在“超度 / 奴役”之间做选择
- `C02` 当前只有 NPC “游荡的幽灵”
- 没有对应变量、plot update、分支 trigger、奖励或状态结果

影响：

- 这里目前只有氛围和角色设定，没有真正的剧情 contract
- 最终战增益如何决定，也没有数据支撑

建议：

- 先把“与幽灵发生关键互动”定义成一个真实结果条件
- 再决定后续是奖励 item、flag 还是 final boss modifier

### 2.7 `PP004` 与最终战场景仍未接通

文件：

- `data/modules/eldora_shadow/module_plot.json`
- `data/modules/eldora_shadow/areas/CRIMSON_SANCTUM.json`

问题：

- `PP004` 现在已经是当前 plot graph 中的顺序节点，不再依赖旧的 dead trigger 字段
- `S01.dmNotes` 也已经补了“摧毁晶体并结束核心冲突 -> `[@PLOT_UPDATE(PP004)]`”的 scene-level contract
- 但“晶体已被摧毁”和“最终战已完成”仍是叙事混合状态，没有分成清晰的结果点

影响：

- 当前可以把剧情推进到 `PP004`
- 但多结局分支与终局状态仍停留在 prose 上，尚未形成严格 contract

建议：

- 把“摧毁晶体”与“最终战结束后的结果状态”分开表达
- 后续至少需要一个明确的 reducer 结果点

## 3. 审计后的工程优先级

基于当前模组，下一步最值得做的不是再加 demo trigger，而是：

1. **清理当前模组的 contract 漂移**
   - 先修 `dmInstructions / actions[] / encounterIds / plot triggers` 的不一致
2. **把 `PP001 / PP002` 这种剧情门从“变量名”升级成“结果条件”**
   - 当前模组已经需要 blocker / resolved condition 了
3. **把 E03 的“发现密道”明确成真实 reveal contract**
   - 否则“发现”永远只是文案，不是规则
4. **把 E04 / E05 / C02 / S01 的剧情结果点数据化**
   - 先不要追求多结局，把“哪些结果真的落地”说清楚

---

## 4. 审计结论

`eldora_shadow` 当前最主要的问题不是“内容不够多”，而是：

- 剧情描述已经进入“多路径、带选择、带结果条件”的层次
- 但数据 contract 还停留在“少量 scene 白名单 + 少量变量门”

因此，下一阶段真正该补的是：

- plot result contract
- blocker / resolved condition
- reveal / unlock contract
- 当前 action 协议与模组数据的一致性

这比继续往 prompt 里加更多限制更重要。
