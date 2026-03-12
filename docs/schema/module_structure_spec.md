# AutoDM 剧本模块 (Module) 完整结构规范

大神，为了实现“即插即用”，剧本被设计为一组**结构化的 JSON 文件集**。它不是一个单一的大文件，而是一个类似于关卡包的文件夹。

根据 `NeverEndingQuest` 的最佳实践并针对 Web 优化的 **AutoDM 剧本标准 v1.0**，其结构如下：

## 1. 目录层级 (Directory Structure)

剧本存放于 `/data/modules/[剧本名]/` 目录下：

```text
/data/modules/eldora_shadow/
├── module_manifest.json    # [核心] 剧本清单：定义故事背景、全局变量、起始点
├── module_plot.json        # [任务] 剧情主线：定义任务树、里程碑与奖励
├── areas/                  # [地理] 地理模块文件夹：将世界拆分为独立的逻辑块
│   ├── THORN_VILLAGE.json  # 城镇模块：包含地点、NPC、商店
│   └── DARK_CAVE.json      # 地下城模块：包含房间、怪物、陷阱
└── entities/               # [实体] 可选：全局 NPC 与 怪物预设
    ├── npcs.json
    └── monsters.json
```

---

## 2. 核心文件详解 (File Schema)

### A. `module_manifest.json` (故事的大纲)

这是 AI 启动时加载的第一份文件，决定了叙事的基调。

```json
{
  "moduleId": "ELDORA_001",
  "name": "艾尔多拉之影",
  "version": "1.0.0",
  "description": "一段关于失落文明的探险...", // 喂给 AI 的总纲
  "startingLocation": "THORN_VILLAGE:A01", // 初始 地理模块:房间ID
  "worldTone": "Dark Fantasy, Grim", // 风格约束
  "languages": ["zh-CN"],
  "globalVariables": {
    "isKingAlive": true,
    "corruptionLevel": 0
  }
}
```

### B. `areas/THORN_VILLAGE.json` (地理泡泡)

这是最关键的部分。**当玩家处于这个区域时，只有这个 JSON 会被喂给 AI。**

```json
{
  "areaId": "THORN_VILLAGE",
  "name": "青石村",
  "description": "一个被寒风侵蚀的边境小村。",
  "locations": [
    {
      "id": "A01",
      "name": "哨所大门",
      "description": "锈迹斑斑的铁门，背后是无尽的迷雾。",
      "connections": ["A02"], // 拓扑结构：玩家只能去 A02
      "npcs": [
        {
          "name": "老李",
          "role": "守门人",
          "dmNotes": "性格孤僻，除非被行贿，否则不让路。" // 喂给 AI 的逻辑指令
        }
      ],
      "actions": ["@STRENGTH_CHECK", "@BRIBE"], // 允许触发的离散动作
      "loot": []
    }
  ]
}
```

### C. `module_plot.json` (逻辑进度条)

如果不拆分这个文件，AI 会忘记玩家到底做到了哪一步。

```json
{
  "plotPoints": [
    {
      "id": "PP001",
      "title": "进入矿区",
      "description": "玩家需要获得老李的许可进入矿区。",
      "trigger": { "type": "location_reach", "value": "DARK_CAVE:E01" },
      "status": "active" // 系统会自动更新此状态
    }
  ]
}
```

---

## 3. 为什么这样设计？(The "Taste" Choice)

1.  **Token 极致节省**：如果玩家在村子里，我们**绝不**把地下城的怪物数据发给 AI。
2.  **硬核逻辑校验**：如果 JSON 里写了 `A01` 只能去 `A02`，那么玩家想飞去 `A05` 时，我们的 `core/engine` 会直接报错拦截，不给 AI 犯错的机会。
3.  **多语种即插即用**：您只需要把 JSON 里的文本翻译成中文，整个系统的逻辑（ID、连接关系）完全不需要动。

**大神，这就是“数据驱动叙事”的乐高积木。** 您是否想尝试亲手定义第一个中文 `area` 模块的物理规则？
