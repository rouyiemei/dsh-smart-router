# dsh-smart-router · DSH 智能路由插件

> 让 DeepSeek Harness 在工作时**自动切换模型**：三级难度（困难 / 一般 / 简单）+ 视觉任务路由。
> 各档模型从你在「设置 → 模型」中**已经配置好**的模型里选取，不重复录入地址与 Key。
> 选一个虚拟模型「Smart Router（自动路由）」，剩下的交给分类器。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-Plugin-4D6BFE)](https://github.com/topics/dsh-plugin)
[![dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-blue)](https://github.com/topics/dsh-plugin)

English · [简体中文](README.md)

## 它解决什么问题

- **性能分层**：困难任务（架构/重构/疑难调试）交给强模型，简单任务（闲聊/收尾/小改动）交给便宜快速的模型，一般任务走中间档——像 cc-switch 为 Claude Code 配置「主模型 / 快速模型 / 视觉模型」那样，为 DSH 配置三档能力。
- **视觉能力**：很多人会额外装视觉插件给 DSH 看图。本插件把视觉路由**整合进路由器**：消息里带图 → 自动走视觉档模型；纯文本 → 按难度走三档。开箱即用，默认内置**免费匿名视觉模型**（OVHcloud Qwen2.5-VL-72B-Instruct，无需 Key），也可换成你自己配置的任何视觉模型。
- **缓存友好**：建议三档选同一供应商的同一系列（如同一家的 pro / flash 版），前缀缓存命中率更高、更省钱（设置页内置提示）。

## 安装

```sh
dsh plugin --profile web add dsh-smart-router
```

重启 `dsh web` 后：

1. 打开 **设置 → 智能路由**：为 困难 / 一般 / 简单 / 视觉 四行各选一个模型（下拉里就是你已配置的模型，视觉行只列支持图片的模型）。
2. 回到会话，点右下角模型选择器，选 **Smart Router（自动路由）**。
3. 直接开聊：分类器自动分流，每个请求都会路由到对应档位的模型。

> 不配置任何档位也能用：请求会回退到你的默认模型（fail-open，绝不静默失败）。

## 工作原理

```
你选择虚拟模型「smart」（声明 text+image，DSH 图片准入直接放行）
        │
        ▼
SmartRouterAdapter.stream(请求)
        │
        ├─ 消息含图？ ──→ 视觉档（默认免费匿名 OVH，可换自配视觉模型）──┐
        │                                                            │
        └─ 否则：难度分类 ──→ hard → 困难档                             │
             （启发式默认 / LLM 可选）──→ normal → 一般档                │
                                  └─→ easy → 简单档                    │
        │                                                            │
        ▼                                                            ▼
   ctx.llm.prepareCall({provider, model}).stream(请求)  ← 透传 DSH 流式协议
        │
        └─ 档位缺失 → 困难→一般→简单→默认模型 阶梯回退；全部失败才报错
```

- 路由在 **LLM 适配器层**完成（参考 llm-adaptive / dsh-vision-mix 的架构）：注册虚拟 provider，`stream()` 内按请求内容决策后经 `prepareCall().stream()` 转发，**不修改宿主源码**，与其它视觉插件互不冲突。
- 分类器两种模式：**启发式**（默认，零成本零延迟，关键词 + 代码量 + 文件引用数评分）；**LLM**（更准，复用简单档模型做一次小调用，带 120s 缓存）。
- 视觉准入：虚拟模型声明 `inputModalities: ['text', 'image']`，DSH 的图片预检（`MODEL_DOES_NOT_SUPPORT_IMAGES`）直接放行——不需要打宿主补丁（对比 dsh-easyvision 的 patch 方案）。

## 设置说明（设置 → 智能路由）

| 设置 | 说明 |
|---|---|
| 启用路由 | 关闭后请求直接走默认模型 |
| 分类方式 | `heuristic` 启发式（默认） / `llm` LLM 分类 |
| 困难 / 一般 / 简单 | 各档 { 提供方, 模型, 思考档位 }，留空 = 未配置（阶梯回退） |
| 视觉 | 默认 `ovh-vision / Qwen2.5-VL-72B-Instruct`（免费匿名）；可换任何自配视觉模型 |
| 默认回退 | 留空 = 会话当前默认模型 |
| LLM 分类器 | 可选，默认复用简单档模型 |

手写配置（`~/.dsh/profiles/web/settings.yaml` 或 profile 的 settings 提供方）：

```yaml
smart-router:
  enabled: true
  classifier: heuristic        # heuristic | llm
  hardProvider: deepseek-official
  hardModel: deepseek-v4-pro
  normalProvider: deepseek-official
  normalModel: deepseek-chat
  easyProvider: deepseek-official
  easyModel: deepseek-flash
  visionProvider: zhipu-vision # 免费额度，需在 设置→模型 填入 GLM_API_KEY
  visionModel: glm-4v-flash
  visionFallbacks: []
  fallbackProvider: ''
  fallbackModel: ''
```

安装时插件会**幂等 seed** 两条免费视觉路由到 `llm-pi-ai`（只补缺失键、绝不覆盖你的配置）：

| 路由 | 模型 | 成本 |
|---|---|---|
| `ovh-vision` | OVHcloud Qwen2.5-VL-72B-Instruct（匿名端点） | 免费，无需 Key（约 2 次/分/IP） |
| `zhipu-vision` | 智谱 GLM-4V-Flash | 免费额度，需在设置页填 `GLM_API_KEY` |

> 视觉默认值开箱即用；需要更稳定/更强的视觉时，把视觉行换成你已配置的模型即可。

## 与其它视觉插件共存

本插件只在「会话模型 = smart」时参与路由，不接管任何现有 provider 路由，也不改动宿主；
其它视觉插件（modlens、dsh-vision-router 等）可同时安装、互不影响。

## 开发与测试

```sh
npm test          # node --test tests/（37 个用例：分类器/路由链/seed 幂等/schema）
```

本地挂载调试：

```sh
dsh plugin --profile web add C:\Users\...\dsh-smart-router   # 目录安装
dsh --profile web --dump-config | grep smart-router          # 确认已挂载
```

## 鸣谢（References）

本项目实际参考了以下开源项目与 DSH 内部机制，在此致谢：

| 项目 | 参考点 |
|---|---|
| [farion1231/cc-switch](https://github.com/farion1231/cc-switch) | 分级模型配置的产品形态（Claude Code 四档：主/快速/思考/视觉） |
| [dylan121322/llm-adaptive](https://github.com/dylan121322/llm-adaptive) | adapter 级路由架构：`registerAdapter` + `prepareCall().stream()` 透传；LLM 分类器判定标准 |
| [BruceLanLan/dsh-tier-router](https://github.com/BruceLanLan/dsh-tier-router) | 档位配置 schema 与阶梯回退、失败升级的取舍 |
| [haiziyao/dsh-vision-mix](https://github.com/haiziyao/dsh-vision-mix) | 在 adapter 层声明 `inputModalities: ['text','image']` 通过 DSH 图片准入（零宿主补丁） |
| [ysr666/dsh-vision-router](https://github.com/ysr666/dsh-vision-router) | 免费视觉链方案：OVHcloud 匿名端点（免 Key）；图片准入机制分析 |
| [s3yf1337/dsh-easyvision](https://github.com/s3yf1337/dsh-easyvision) | 用 `resolveModelInfo().inputModalities` 判读模型视觉能力的模式 |
| [akqwpeter-prog/dsh-media-skills](https://github.com/akqwpeter-prog/dsh-media-skills) | 向 `llm-pi-ai` 幂等 seed 免费视觉路由（zhipu-vision）的模式 |
| DeepSeek Harness 内部 | `dsh-llm`（LlmAdapter/llm 服务/prepareCall 契约）、`dsh-settings`（installSettingsSection）、`dsh-agent-loop`（agent/request 瀑布）、`dsh-client-modules`（客户端 bundle 契约） |

## 许可证

MIT
