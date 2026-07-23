import type { AiConfig } from "./config";
import type { AiProvider } from "./provider";
import { postJson } from "./fetch";

/**
 * OpenAI /chat/completions with a vision message. Works for OpenAI, OpenRouter,
 * Groq, DeepSeek, Together, Gemini's compat endpoint, and every local runner
 * (Ollama, LM Studio, vLLM, llama.cpp). `response_format: json_object` nudges
 * JSON where supported; the vision service tolerates providers that ignore it.
 */
export function openAiProvider(cfg: AiConfig): AiProvider {
  return {
    async complete(req) {
      if (!cfg.baseUrl) throw new Error("AI base URL is not set");
      const url = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;
      const headers: Record<string, string> = {};
      if (cfg.apiKey) headers["authorization"] = `Bearer ${cfg.apiKey}`;
      const data = await postJson(url, {
        headers,
        timeoutMs: req.timeoutMs,
        body: {
          model: cfg.model,
          temperature: 0.2,
          max_tokens: 1024,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: req.prompt },
                {
                  type: "image_url",
                  image_url: { url: `data:${req.mimeType};base64,${req.imageBase64}` },
                },
              ],
            },
          ],
        },
      });
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text !== "string")
        throw new Error("AI response had no text content (unexpected chat/completions shape)");
      return text;
    },
  };
}
