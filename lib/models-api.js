/**
 * Host HTTP API for the Smart Router settings card.
 *
 * - `GET /smart-router/api/models` — live model catalog for the pickers:
 *   every registered provider (the same registry the chat model selector
 *   uses), each model annotated with vision capability and reasoning efforts
 *   from `resolveModelInfo`, plus the current default model.
 * - `GET /smart-router/api/stats` — in-memory route decision counters.
 *
 * The client renders provider/model/effort selects from this data and writes
 * selections through the settings scope, so the host stays the single fact
 * source (同 dsh-memory-evolve 的 /api/models 聚合模式).
 */

/** Resolve one provider entry's display name from the configurable directory. */
function displayNameOf(entries, providerId) {
  const entry = entries.find((candidate) => candidate.provider === providerId)
  return entry !== undefined && entry.displayName !== '' ? entry.displayName : providerId
}

/**
 * Build the picker catalog: registered providers → models → capability
 * metadata. Degrades per model (unknown vision = null, no reasoning = none).
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @returns {Promise<{groups: Array<object>, failures: Array<object>, defaultModel: object|null}>}
 */
export async function buildPickerCatalog(ctx) {
  const entries = ctx.llm.listConfigurableProviders()
  const providers = ctx.llm.listProviders()
  const defaultModel = (() => {
    try {
      const selection = ctx.get?.('agentDefaultModel')?.currentSelection?.()
      if (selection && selection.provider) {
        return {
          provider: selection.provider,
          model: selection.model,
          ...(selection.reasoningEffort === undefined ? {} : { reasoningEffort: String(selection.reasoningEffort) }),
        }
      }
    } catch { /* absent */ }
    return null
  })()

  const groups = await Promise.all(providers.map(async (provider) => {
    let models = []
    try {
      const listed = await ctx.llm.listModels(provider.id)
      models = await Promise.all(listed.map(async (model) => {
        const base = {
          id: model.id,
          name: model.name,
          ...(model.description === undefined ? {} : { description: model.description }),
        }
        try {
          const info = await ctx.llm.resolveModelInfo(provider.id, model.id)
          return {
            ...base,
            vision: info.inputModalities === undefined
              ? null
              : info.inputModalities.includes('image'),
            ...(info.reasoning === undefined
              ? {}
              : {
                  reasoningEfforts: info.reasoning.efforts.map((effort) => ({
                    id: effort.id,
                    name: effort.name,
                  })),
                  defaultEffort: info.reasoning.defaultEffort,
                }),
          }
        } catch {
          return { ...base, vision: null }
        }
      }))
    } catch (error) {
      return {
        kind: 'failure',
        failure: { id: provider.id, name: provider.name, message: String(error) },
      }
    }
    return {
      kind: 'group',
      group: {
        id: provider.id,
        name: displayNameOf(entries, provider.id),
        models,
      },
    }
  }))

  const failures = []
  const result = []
  for (const item of groups) {
    if (item.kind === 'failure') failures.push(item.failure)
    else result.push(item.group)
  }
  return { groups: result, failures, defaultModel }
}

/** Register the web API under `/smart-router`. */
export function installModelsApi(ctx, getStats) {
  const sendJson = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
  }
  const handler = async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const path = url.pathname
      if (req.method === 'GET' && path === '/smart-router/api/models') {
        sendJson(res, 200, await buildPickerCatalog(ctx))
        return
      }
      if (req.method === 'GET' && path === '/smart-router/api/stats') {
        sendJson(res, 200, { stats: getStats().snapshot() })
        return
      }
      sendJson(res, 404, { error: 'not found' })
    } catch (error) {
      sendJson(res, 400, { error: error?.message ?? String(error) })
    }
  }
  return ctx.webServer.register({ kind: 'prefix', path: '/smart-router', handler })
}
