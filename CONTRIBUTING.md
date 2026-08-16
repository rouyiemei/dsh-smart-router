# Contributing / 贡献指南

欢迎提交 PR 与 Issue。本项目遵循 DSH 插件社区惯例：

## 开发约定

- **一次一个文件一个提交**，commit 前缀：`feat:` / `fix:` / `docs:` / `test:` / `chore:`。
- 中英双语：代码注释逐段双语；README 双语同步更新。
- 新增分类规则必须附带单元测试（`tests/classifier.test.js`），启发式分类器是纯函数，行为可预测。

## 本地验证

```sh
npm test                                  # 全部单测
dsh plugin --profile web add <本目录>      # 挂载到 web profile
dsh --profile web --dump-config | grep smart-router
```

## 改动面

- `lib/router.js` — 路由决策与 adapter（核心，改动需谨慎 + 测试）
- `lib/classifier.js` — 启发式/LLM 分类器（纯函数优先）
- `lib/schema.js` — 设置 schema 与免费视觉 seed（幂等）
- `client/client.js` — 设置页（手写 bundle，无构建步骤）
- `lib/models-api.js` — 模型目录 HTTP API

## 行为准则

- 不修改 DSH 宿主源码（本项目零补丁承诺）。
- 不把任何 API Key 写进仓库；凭据一律走 DSH 凭据存储。
