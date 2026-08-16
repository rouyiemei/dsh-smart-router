# Changelog

All notable changes to dsh-smart-router are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/lang/zh-CN/).

## [0.1.0] - 2026-08-16

### Added

- 虚拟路由 provider `smart-router`（模型 `smart`）：注册 LlmAdapter，`stream()` 内按请求分类后经 `ctx.llm.prepareCall().stream()` 透传转发。
- 三级难度分类：启发式（关键词 + 代码量 + 文件引用数评分，纯函数可单测）与 LLM 分类（复用简单档模型，120s 缓存）双模式。
- 视觉路由：消息含图自动走视觉档；虚拟模型声明 `inputModalities: ['text','image']`，零宿主补丁通过 DSH 图片准入。
- 免费视觉默认值：幂等 seed `ovh-vision`（OVHcloud 匿名 Qwen2.5-VL-72B-Instruct，免 Key）与 `zhipu-vision`（GLM-4V-Flash，免费额度）到 `llm-pi-ai`。
- 设置项：启用开关、分类方式、四档模型行（提供方/模型/思考档位）、默认回退、LLM 分类器、阶梯回退（困难→一般→简单→默认），fail-open 语义。
- 客户端设置页（手写 `window.__ModuleLoader__` bundle，无构建步骤）：模型目录下拉（含视觉能力徽标）、路由统计、恢复默认。
- 宿主 HTTP API：`GET /smart-router/api/models`（模型目录 + 视觉标记 + 思考档位）与 `GET /smart-router/api/stats`。
- 测试 37 例（分类器 / 路由链 / seed 幂等 / schema 默认），`node --test tests/` 全绿。

## [Unreleased]

### Planned

- 失败自动升级（easy→hard，agent/error 窗口计数）。
- 视觉答案按图内容 hash 缓存。
- `/smart-router` 斜杠命令（status / route 调试）。
