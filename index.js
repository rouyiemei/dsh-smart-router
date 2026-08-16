/**
 * dsh-smart-router — automatic model routing for DeepSeek Harness.
 *
 * Host entry: registers the virtual `smart-router` provider (model `smart`),
 * its settings namespace, the picker HTTP API, and seeds free vision routes.
 * The client half (`./client/client.js`) renders the settings section.
 */

import {
  DEFAULTS, MODEL, NAMESPACE, PROVIDER, SETTINGS_SCHEMA,
} from './lib/schema.js'
import { SmartRouterAdapter, createStats, seedVisionProviders } from './lib/router.js'
import { installModelsApi } from './lib/models-api.js'
import { settingsNamespace, installSettingsSection } from '@deepseek-ai/dsh-settings'

/** Cordis plugin name. */
export const name = 'dsh-smart-router'
/** Host services this plugin requires. */
export const inject = ['llm']

/**
 * Register the router: settings section (flat, user-editable), adapter,
 * web API, and free-vision seeding.
 */
export function apply(ctx, config) {
  const entry = { ...DEFAULTS, ...(config ?? {}) }
  const stats = createStats()
  const router = new SmartRouterAdapter(ctx, () => source(), { stats })

  // Settings: schema defaults ← entry base ← user section (live source).
  let source = () => entry
  installSettingsSection(ctx, settingsNamespace(NAMESPACE), SETTINGS_SCHEMA, entry, {
    setSource: (next) => {
      source = next
    },
    onChange: () => {},
  })

  // Adapter + directory: the model picker discovers the provider through the
  // registered adapter; we deliberately do NOT register a configurable-provider
  // directory entry so the Settings → Models page stays clean (the router's own
  // configuration lives in its own settings section).
  const registration = ctx.llm.registerAdapter([PROVIDER], router)

  // Web API for the settings card (web-only service; dynamic inject so the
  // plugin also loads on surfaces without a web server).
  ctx.inject(['webServer'], (webCtx) => {
    installModelsApi(webCtx, () => stats)
  })

  // Free vision routes (additive, idempotent, best-effort). The `llm-pi-ai`
  // settings namespace may not be registered yet at apply time (plugin load
  // order), so retry when the adapter topology changes and once more after a
  // short delay; seeding is idempotent and cheap, so extra attempts are safe.
  void seedVisionProviders(ctx)
  const retrySeed = () => {
    void seedVisionProviders(ctx)
  }
  ctx.on('llm/adapters-updated', retrySeed)
  const seedTimer = setTimeout(retrySeed, 4000)
  ctx.effect(() => () => {
    clearTimeout(seedTimer)
  })

  return () => {
    registration()
  }
}

export { DEFAULTS, MODEL, NAMESPACE, PROVIDER, SETTINGS_SCHEMA }
