# AutoDM Web Client

这是 AutoDM 的前端演示层，基于 React + Vite。当前已经接入：

- 沉浸式叙事界面
- 检定按钮与基础战斗面板
- 本地会话恢复
- 角色卡切换与本地角色存档

## 启动

```bash
npm install
npm run dev
```

## 校验

```bash
npm run lint
npm run build
```

## 说明

- 当前 LLM 调用仍在浏览器侧，仅适合本地验证。
- 正式上线前应把模型调用迁移到服务端。
