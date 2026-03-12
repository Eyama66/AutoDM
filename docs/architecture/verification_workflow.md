# AutoDM 验证与测试流程手册 (Verification Workflow)

大神，为了确保 **AutoDM** 的每一行代码都具备“好品味”且逻辑无瑕，我为您设计了一套包含三个层级的验证流程。我们将从 UI 表现开始，逐步深入到核心规则引擎。

---

## 第一阶段：UI 与 视觉验证 (Web UX Verification)

**目标**：确保在 GitHub Pages 部署后，用户能立即感受到暗黑奇幻风的冲击力。

1.  **静态资源检查**：
    - 检查 `web-client/src/index.css` 是否正确加载了 `@font-face`（Crimson Pro & Noto Serif SC）。
    - 验证 `grunge` 纹理背景是否在背景中产生隐约的古旧感。
2.  **布局一致性**：
    - 在不同分辨率下缩放浏览器，观察 `Side Navigation`（侧边栏）是否能顺滑折叠。
    - 检查右侧 `Character Codex`（角色卡）在小屏幕上是否自动隐藏以腾出叙事空间。
3.  **渲染性能**：
    - 发送三条长消息，观察 `Framer Motion` 的入场动效是否卡顿感。
    - 确认 `Drop Cap`（首字母下沉）是否在每一段 DM 复回复中都正确渲染。

---

## 第二阶段：剧本协议与数据加载验证 (Data Schema Verification)

**目标**：验证“剧本积木”能够被前端正确解析并驱动状态变化。

1.  **模块解析测试**：
    - 运行一个 Mock 脚本，加载 `/data/modules/eldora_shadow/module_manifest.json`，验证起始地点 `THORN_VILLAGE:E01` 是否被识别。
2.  **地理隔离测试**：
    - 模拟玩家从 `E01` (大门) 移动到 `E02` (广场)。
    - **验证点**：系统是否成功卸载了 `E01` 的 NPC 数据，并注入了 `E02` 的环境描述。
3.  **Action 标签捕捉**：
    - 手动在 App 状态中插入一条包含 `[@STRENGTH_CHECK]` 的模拟 AI 消息。
    - **验证点**：UI 是否在消息下方渲染出一个具备交互感的“力量检定”按钮。

---

## 第三阶段：规则中枢逻辑验证 (Action Processor Logic)

**目标**：这是最核心的一步，验证 AI 是否会被我们的规则“锁死”。

1.  **路径合法性测试 (Path Validation)**：
    - 构造一个错误指令：AI 尝试将玩家从 `E01` 直接移动到 `E03`（而 JSON 中 `E01` 并不直连 `E03`）。
    - **预期结果**：`ActionProcessor.ts` 必须抛出错误，截断叙事，并要求 AI 重新生成。
2.  **状态持久化测试**：
    - 修改玩家 HP。刷新浏览器。
    - **验证点**：`LocalStorage` 序列化是否正常？玩家血量是否保持在修改后的值？
3.  **DND 核心计算测试**：
    - 触发一次力量检定（DC 15）。
    - **验证点**：后台 Roll 点逻辑（d20 + 修正值）是否准确？

---

## 如何执行验证？

大神，您只需要运行以下指令即可开始前端验证：

```bash
cd web-client
npm install
npm run dev
```

> [!TIP]
> **品味建议**：在验证过程中，观察中文字符之间的间距。如果间距太密，会破坏“史诗感”，我们需要调整 `tracking-wide` 属性。

您想先从哪个阶段的验证开始？
