import type { AiConfig } from "./config";
import { openAiProvider } from "./openai";
import { anthropicProvider } from "./anthropic";

export interface VisionRequest {
  imageBase64: string; // raw base64, no data: prefix
  mimeType: string; // image/jpeg | image/png | image/webp
  prompt: string;
  timeoutMs: number;
}

export interface AiProvider {
  /** Send prompt + image, return the model's raw text (JSON not guaranteed). */
  complete(req: VisionRequest): Promise<string>;
}

export function getProvider(cfg: AiConfig): AiProvider {
  switch (cfg.provider) {
    case "anthropic":
      return anthropicProvider(cfg);
    case "openai-compatible":
      return openAiProvider(cfg);
    default:
      throw new Error(`unknown AI provider: ${cfg.provider}`);
  }
}
