import type { AiConfig } from "./config";
import type { AiProvider } from "./provider";
import { postJson } from "./fetch";

/**
 * Anthropic Messages API with a base64 image content block. baseUrl is optional
 * here — it defaults to the public API, but can point at a proxy/gateway.
 */
export function anthropicProvider(cfg: AiConfig): AiProvider {
  return {
    async complete(req) {
      const base = (cfg.baseUrl || "https://api.anthropic.com").replace(/\/+$/, "");
      const url = `${base}/v1/messages`;
      if (!cfg.apiKey) throw new Error("Anthropic needs an API key — set it in Settings");
      const data = await postJson(url, {
        timeoutMs: req.timeoutMs,
        headers: { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
        body: {
          model: cfg.model,
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: req.prompt },
                {
                  type: "image",
                  source: { type: "base64", media_type: req.mimeType, data: req.imageBase64 },
                },
              ],
            },
          ],
        },
      });
      const text = data?.content?.[0]?.text;
      if (typeof text !== "string")
        throw new Error("AI response had no text content (unexpected messages shape)");
      return text;
    },
  };
}
