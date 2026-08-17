# dsh-smart-router · Smart model routing for DeepSeek Harness

> Automatic model switching while DSH works: three difficulty tiers (hard / normal / easy) plus vision routing.
> Tier models are picked from the models you **already configured** under Settings → Models — no re-entering endpoints or API keys.
> Select one virtual model, "Smart Router (auto route)", and let the classifier do the rest.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-Plugin-4D6BFE)](https://github.com/topics/dsh-plugin)
[![dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-blue)](https://github.com/topics/dsh-plugin)

English · [简体中文](README.md)

## What it solves

- **Performance tiering**: hard tasks (architecture, refactoring, tricky debugging) go to a strong model; easy tasks (small talk, wrap-ups, tiny edits) go to a cheap fast model; everything else hits the middle tier — like cc-switch's per-tier model slots for Claude Code, but for DSH.
- **Vision built in**: many users add a separate vision plugin; this router integrates vision routing into itself. Requests with images → vision tier automatically; plain text → difficulty tiers. Out of the box it ships a **free anonymous vision model** (OVHcloud Qwen2.5-VL-72B-Instruct, no API key), replaceable with any vision-capable model you configured.
- **Cache friendly**: pick all three tiers from the same vendor family (e.g. pro and flash editions of one series) for higher prefix-cache hit rates and lower cost (hint shown in the settings card).

## Install

```sh
dsh plugin --profile web add dsh-smart-router
```

Restart `dsh web`, then:

1. Open **Settings → Smart Router**: pick a model for each of the four rows (hard / normal / easy / vision). Dropdowns list the models you already configured; the vision row only lists models that declare image input.
2. Back in chat, open the model picker and choose **Smart Router (auto route)**.
3. Chat normally — every request is classified and routed automatically.

> Zero configuration also works: requests fall back to your default model (fail-open, never silently broken).

## How it works

```
You pick the virtual model "smart" (declares text+image, passes DSH image admission)
        │
        ▼
SmartRouterAdapter.stream(request)
        │
        ├─ has image? ──────→ vision tier (free anonymous OVH by default) ──┐
        │                                                                │
        └─ else: classify ──→ hard → hard tier                             │
          (heuristic by    → normal → normal tier                          │
           default / LLM)  → easy → easy tier                              │
        │                                                                │
        ▼                                                                ▼
   ctx.llm.prepareCall({provider, model}).stream(request)  ← passthrough stream
        │
        └─ missing tier → hard→normal→easy→default ladder; error only when all fail
```

- Routing happens at the **LLM adapter layer** (architecture from llm-adaptive / dsh-vision-mix): a virtual provider is registered; `stream()` decides per request and delegates via `prepareCall().stream()` — **no host patches**, no conflicts with other vision plugins.
- Classifier modes: **heuristic** (default; zero cost — keywords + code volume + file references) or **LLM** (more accurate; one small call on the easy-tier model, 120s cache).
- Image admission: the virtual model declares `inputModalities: ['text', 'image']`, so DSH's preflight (`MODEL_DOES_NOT_SUPPORT_IMAGES`) lets images through — no host patching (compare dsh-easyvision's patch approach).

## Settings (Settings → Smart Router)

| Setting | Meaning |
|---|---|
| Enable routing | Off = requests go to the session default model unchanged |
| Classifier | `heuristic` (default) / `llm` |
| Hard / Normal / Easy | { provider, model, effort } per tier; empty = unconfigured (ladder fallback) |
| Vision | Default `ovh-vision / Qwen2.5-VL-72B-Instruct` (free, anonymous); replace with any configured vision model |
| Default fallback | Empty = the session default model |
| LLM classifier | Optional; defaults to the easy-tier model |

Manual config (`~/.dsh/profiles/web/settings.yaml`):

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
  visionProvider: zhipu-vision # free quota; add GLM_API_KEY under Settings → Models
  visionModel: glm-4v-flash
  visionFallbacks: []
  fallbackProvider: ''
  fallbackModel: ''
```

On install the plugin **idempotently seeds** two free vision routes into `llm-pi-ai` (missing keys only, your config is never touched):

| Route | Model | Cost |
|---|---|---|
| `ovh-vision` | OVHcloud Qwen2.5-VL-72B-Instruct (anonymous endpoint) | Free, no key (~2 req/min/IP) |
| `zhipu-vision` | Zhipu GLM-4V-Flash | Free quota; set `GLM_API_KEY` in Settings → Models |

> The vision default works out of the box; for more stable/stronger vision, point the vision row at any vision model you configured.

## Coexistence with other vision plugins

The router only participates when the session model is `smart`; it never takes over existing provider routes and never touches the host, so modlens, dsh-vision-router and friends can stay installed side by side.

## Development

```sh
npm test          # node --test tests/ (37 cases: classifier / chain / seed idempotency / schema)
```

Local install for debugging:

```sh
dsh plugin --profile web add C:\path\to\dsh-smart-router
dsh --profile web --dump-config | grep smart-router
```

## Acknowledgements (References)

This plugin directly references the following open-source projects and DSH internals:

| Project | What was referenced |
|---|---|
| [farion1231/cc-switch](https://github.com/farion1231/cc-switch) | The per-tier model slot product shape (Claude Code's main/fast/thinking/vision tiers) |
| [dylan121322/llm-adaptive](https://github.com/dylan121322/llm-adaptive) | Adapter-level routing: `registerAdapter` + `prepareCall().stream()` passthrough; LLM classifier rubric |
| [BruceLanLan/dsh-tier-router](https://github.com/BruceLanLan/dsh-tier-router) | Tier config schema shape and fallback/escalation trade-offs |
| [haiziyao/dsh-vision-mix](https://github.com/haiziyao/dsh-vision-mix) | Declaring `inputModalities: ['text','image']` at the adapter to pass DSH image admission (zero host patches) |
| [liustack/modlens](https://github.com/liustack/modlens) | Structured vision evidence: summary/OCR/layout/semantics/visual/uncertainty template and the "vision parsing engine" prompt (source-level reference) |
| [gloryxpnv/dsh-tool-vision](https://github.com/gloryxpnv/dsh-tool-vision) | Same structured JSON evidence template; the `vision-bridge` image→text replacement and fail-open pattern |
| [ysr666/dsh-vision-router](https://github.com/ysr666/dsh-vision-router) | Free vision chain: anonymous OVHcloud endpoint (no key); image-admission analysis; per-image caching |
| [s3yf1337/dsh-easyvision](https://github.com/s3yf1337/dsh-easyvision) | Reading model vision capability via `resolveModelInfo().inputModalities` |
| [akqwpeter-prog/dsh-media-skills](https://github.com/akqwpeter-prog/dsh-media-skills) | Idempotent free-vision route seeding into `llm-pi-ai` (zhipu-vision) |
| DeepSeek Harness internals | `dsh-llm` (LlmAdapter / llm service / prepareCall contract), `dsh-settings` (installSettingsSection), `dsh-agent-loop` (agent/request waterfall), `dsh-client-modules` (client bundle contract) |

## License

MIT
