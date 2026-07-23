import { getSetting, setSetting } from "../settings";

export type AiProviderName = "openai-compatible" | "anthropic";

export interface AiConfig {
  enabled: boolean;
  provider: AiProviderName;
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
}

/**
 * Resolved AI config, including the real API key. The key comes from the
 * `ai_api_key` setting first, falling back to `process.env.AI_API_KEY` — DB so
 * it's UI-editable, env so it can stay out of the (plaintext) database. Never
 * return this straight to a client; use {@link maskedAiConfig} for GETs.
 */
export function getAiConfig(): AiConfig {
  const provider = getSetting("ai_provider");
  return {
    enabled: getSetting("ai_enabled") === "true",
    provider: provider === "anthropic" ? "anthropic" : "openai-compatible",
    baseUrl: getSetting("ai_base_url").trim(),
    model: getSetting("ai_model").trim(),
    apiKey: getSetting("ai_api_key") || process.env.AI_API_KEY || "",
    timeoutMs: Number(getSetting("ai_timeout_ms")) || 60000,
  };
}

export interface AiConfigPatch {
  enabled?: boolean;
  provider?: AiProviderName;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export function setAiConfig(patch: AiConfigPatch) {
  if (patch.enabled !== undefined) setSetting("ai_enabled", patch.enabled ? "true" : "false");
  if (patch.provider !== undefined) setSetting("ai_provider", patch.provider);
  if (patch.baseUrl !== undefined) setSetting("ai_base_url", patch.baseUrl.trim());
  if (patch.model !== undefined) setSetting("ai_model", patch.model.trim());
  if (patch.timeoutMs !== undefined) setSetting("ai_timeout_ms", String(patch.timeoutMs));
  // An empty apiKey means "leave the stored key alone" — the GET masks the key,
  // so a masked config round-tripped back through PUT must not wipe it.
  if (patch.apiKey !== undefined && patch.apiKey !== "") setSetting("ai_api_key", patch.apiKey);
}

export interface MaskedAiConfig {
  enabled: boolean;
  provider: AiProviderName;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  hasKey: boolean;
  keyFromEnv: boolean;
}

/** Config safe to send to a client: the key is reduced to presence + source. */
export function maskedAiConfig(): MaskedAiConfig {
  const cfg = getAiConfig();
  const stored = getSetting("ai_api_key");
  return {
    enabled: cfg.enabled,
    provider: cfg.provider,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    timeoutMs: cfg.timeoutMs,
    hasKey: cfg.apiKey.length > 0,
    keyFromEnv: !stored && !!process.env.AI_API_KEY,
  };
}
