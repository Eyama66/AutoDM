# AutoDM

AutoDM 是一个中文跑团原型项目引擎，当前目标是把 AI 叙事、离散动作标签、地理拓扑校验和前端体验先打通。现在这份仓库已经能本地跑起来，并且支持基础的会话恢复。

## 当前包含什么

- `core/`
  - `ActionProcessor` 解析 `[@ACTION(...)]` 标签并清洗叙事文本
  - `CampaignManager` 负责地理移动校验、状态更新、战斗触发
  - `CoreRules` 支持英文/中文检定名映射，能正确处理 `感知 / 调查 / 奥法 / 宗教 / 敏捷`
- `data/`
  - `eldora_shadow` 模组包含 manifest、plot、3 个 area、角色卡和怪物数据
  - `startingLocation` 使用 `AREA:LOCATION` 形式，例如 `THORN_VILLAGE:E01`
- `web-client/`
  - React + Vite 前端原型
  - 本地保存聊天记录、角色卡、当前区域和剧情变量
  - 可构建、可 lint

## 运行方式

前端：

```bash
cd web-client
npm install
npm run dev
```

核心验证：

```bash
cd core
npm install
npm test
```

## 当前边界

- 浏览器侧 LLM 调用仍是临时方案，正式上线前应迁移到服务端。
- `server/` 目录目前仍是预留位，尚未接入多用户会话或流式返回。
- 战斗系统是可玩的原型，不是完整 5e 战斗裁定器。
