# AutoDM 调试记录：根因与解决方法

这份文档记录每次调试会话中找到的根因和解决方法。
目的是避免 circular regression——改完 A 出 B，改完 B 出 A。

每条记录格式：
- **症状**：表面现象
- **根因**：真正的问题在哪里
- **解决方法**：做了什么
- **风险点**：下次改动哪里容易重新引入这个问题

---

## [2026-03] trigger lifecycle + session restore

### 症状
trigger 激活后，刷新页面 / 重新加载 session 时，旧的 `activeTrigger` 被持久化并恢复，导致玩家在错误的 scene 里仍受上一次检定的 trigger 约束。

### 根因
`gameSessionStorage.js` 的 `buildInitialSession()` 在合并 `persistedSession` 时，直接透传了 `triggerRuntime` 字段，没有主动重置 `activeTrigger`。

### 解决方法
在 `buildInitialSession()` 的 merge 阶段强制覆盖：
```js
triggerRuntime: {
  activeTrigger: null,
}
```
触发器是瞬态状态，不应跨 session 持久化。

### 风险点
- 如果未来 `triggerRuntime` 添加了需要持久化的新字段（例如 `triggerHistory`），合并逻辑需要拆开，而不是整体覆盖
- 任何新的"session restore"代码路径都需要同样处理 `triggerRuntime`

---

## [2026-03] eldora_shadow 模组数据漂移

### 症状
`test:module-contracts` 校验失败；或者 AI 生成了引擎无法处理的 action 标签（如 `@STRENGTH_CHECK`、`@GIVE_TOKEN`）。

### 根因
模组 JSON 数据是手写的，与引擎实际支持的 action 协议脱节：

1. `THORN_VILLAGE.json` 的 `E01.actions` 使用了不存在的 action 类型（`@STRENGTH_CHECK`、`@PERSUASION_CHECK`、`@GIVE_TOKEN`）
2. `module_plot.json` 使用了旧的 `trigger` 字段，引擎实际消费的是 `nextPoints` / `prerequisites`
3. `WHISPERING_CATACOMBS.json` 的 `dmInstructions` 引用了与 `C01.encounters` 不匹配的 encounter ID

### 解决方法
1. `E01.actions` 改成引擎支持的标准格式：`@CHECK(力量:14)` / `@CHECK(说服:13)` / `@CHECK(感知:14)`
2. `module_plot.json` 的所有 plot node 改成 `nextPoints` / `prerequisites` 结构
3. `dmInstructions` 中的 encounter ID 改成与 `encounters[]` 声明一致的真实 ID
4. 新增 `moduleContractValidator.ts` + `test:module-contracts` 脚本，防止同类漂移重新积累

### 风险点
- **根本风险**：模组数据是人工维护的，容易和引擎协议再次脱节
- `ActionProcessor.ts` 的 `SUPPORTED_ACTION_TYPES` 是单一事实来源，模组数据和 validator 都依赖它；如果在 `ActionProcessor` 里加新 action type 但没同步到 `SUPPORTED_ACTION_TYPES`，validator 会误报错误
- `dmNotes` / `dmInstructions` 中的嵌入式 action 标签（`[@MOVE(...)]` 等）不受 JSON schema 校验，只能靠 `moduleContractValidator` 的文本解析发现问题——这是当前最脆弱的一层
- 新增 area 文件时，必须在 `test_module_contracts.ts` 的 `areaFiles` 数组里手动添加文件名，否则新 area 不会被测试覆盖

---

## [2026-03] module contract validator：@MOVE 跨区域引用误报

### 症状
`E03` 的连接 `WHISPERING_CATACOMBS:C01` 在 validator 中触发 `move.unknown_target` 错误，但这是合法的跨区域连接。

### 根因
`collectKnownSceneIds()` 收集 scene ID 的格式是 `AREA_ID:LOCATION_ID`（例如 `WHISPERING_CATACOMBS:C01`）。
`validateParsedAction` 中的 `@MOVE` 检查用 `parseLocationRef` 解析目标，解析后的 `sceneId` 需要与 `knownSceneIds` 格式一致。
如果 `parseLocationRef` 的输出格式和 `collectKnownSceneIds` 的格式不统一，就会误报。

### 解决方法
确保 `parseLocationRef` 返回的 `sceneId` 格式与 `collectKnownSceneIds` 生成的格式完全一致（均为 `AREA_ID:LOCATION_ID`）。

### 风险点
- 如果将来修改 `parseLocationRef` 的返回格式，必须同步更新 `collectKnownSceneIds`
- 同区域的 `@MOVE`（只写 `E02`，不写 `THORN_VILLAGE:E02`）依赖 `parseLocationRef` 用当前 `areaId` 补全，如果 `areaId` 传入有误则会误判为未知目标

---

## [2026-03] test:ai-loop 断言与实际 prompt contract 脱节

### 症状
`test:ai-loop` 测试失败，但 AI 实际行为正确。

### 根因
`test_ai_loop.ts` 的断言是硬编码的字符串匹配，直接检查 prompt 里是否包含特定文本。
当 prompt 格式（如 `CTX_PACKET` 结构、`possibilitySpace` 字段名）因引擎迭代而变化时，断言没有同步更新，导致误报失败。

### 解决方法
更新 `test_ai_loop.ts` 的断言，使其与当前 prompt contract 保持一致。

### 风险点
- `test:ai-loop` 的断言本质上是"文本快照测试"，任何 prompt 措辞调整都会导致它失败——这是维护成本，不是真正的逻辑错误
- **更深层的风险**：如果为了让测试通过而修改断言，但没有验证实际 AI 行为，测试变成了橡皮图章
- 建议每次修改 prompt 时，先跑一次 `test:ai-loop`，根据失败信息判断是"prompt 改了导致断言过时"还是"真正的行为退化"

---

## 当前已知的结构性欠债（不是 bug，但下次改动需要注意）

| 欠债项 | 风险 | 涉及文件 |
|--------|------|----------|
| E03 仍是静态连接，"发现密道"只是叙事 | AI 可能直接引导玩家去 E03 而不需要检定 | `THORN_VILLAGE.json` |
| PP001-PP004 都靠 dmNotes 里的 `@PLOT_UPDATE` 推进，没有统一结果条件 | 多路径到同一 plot node，但系统无法验证哪条路真的完成了 | `THORN_VILLAGE.json`, `WHISPERING_CATACOMBS.json`, `module_plot.json` |
| blocker / resolvedWhen 未实现 | 系统不能表达"剧情推进依赖具体结果条件" | `CampaignManager.ts`, `module_plot.json` |
| `test_module_contracts.ts` 的 `areaFiles` 是手动维护的数组 | 新增 area 文件时容易漏测 | `test_module_contracts.ts` |
