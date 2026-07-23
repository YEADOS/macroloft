import { foodInputSchema, type CreateFoodInput } from "./foods";
import { getAiConfig } from "./ai/config";
import { getProvider } from "./ai/provider";
import { extractJson } from "./ai/extract";

const PROMPT = `You are a nutrition assistant. Estimate the nutrition of the food in this photo.

Respond with ONLY a JSON object (no prose, no code fences) in this exact shape:
{
  "name": "short food name",
  "brand": "brand if clearly visible on packaging, otherwise omit",
  "proteinG": number,   // grams of protein PER 100 g of the food
  "carbsG": number,     // grams of carbohydrate PER 100 g
  "fatG": number,       // grams of fat PER 100 g
  "satFatG": number,    // optional, PER 100 g
  "sugarsG": number,    // optional, PER 100 g
  "fibreG": number,     // optional, PER 100 g
  "sodiumMg": number,   // optional, milligrams PER 100 g
  "energyKcal": number, // optional, kcal PER 100 g — omit to auto-compute from macros
  "servings": [{ "name": "as photographed", "grams": number }],
  "note": "one short sentence on the assumptions you made"
}

Rules:
- Every macro number is PER 100 GRAMS of the food, never per plate.
- The single servings[] entry is your estimate of the whole portion's weight in grams.
- If the photo shows a mixed plate, give one blended food for the whole plate.
- Always return your best guess even when unsure; put the uncertainty in "note".`;

export interface FoodEstimate {
  /** Draft custom food, validated through the same schema as POST /foods. */
  food: CreateFoodInput;
  /** The model's short assumption note, if it gave one. */
  note?: string;
}

function tryExtract(raw: string): unknown {
  try {
    return extractJson(raw);
  } catch {
    return null;
  }
}

export async function estimateFoodFromPhoto(
  imageBase64: string,
  mimeType: string,
): Promise<FoodEstimate> {
  const cfg = getAiConfig();
  if (!cfg.enabled)
    throw new Error("AI estimation is off — enable it in Settings and configure a provider.");
  if (!cfg.model) throw new Error("No AI model set — configure it in Settings.");

  const provider = getProvider(cfg);
  // Accept a data: URL or raw base64.
  const image = imageBase64.replace(/^data:[^;]+;base64,/, "");
  const ask = (extra = "") =>
    provider.complete({ imageBase64: image, mimeType, prompt: PROMPT + extra, timeoutMs: cfg.timeoutMs });

  let parsed = tryExtract(await ask());
  let result = foodInputSchema.safeParse(parsed);
  if (!result.success) {
    // One retry with a stricter reminder — the local-model reality.
    parsed = tryExtract(
      await ask("\n\nYour previous reply could not be parsed. Reply with ONLY the JSON object."),
    );
    result = foodInputSchema.safeParse(parsed);
    if (!result.success)
      throw new Error(
        `AI reply didn't match the food format: ${result.error.issues
          .map((i) => `${i.path.join(".") || "(root)"} ${i.message}`)
          .join("; ")}`,
      );
  }

  const note =
    parsed && typeof (parsed as { note?: unknown }).note === "string"
      ? (parsed as { note: string }).note
      : undefined;
  return { food: result.data, note };
}

export interface AiTestResult {
  ok: boolean;
  provider: string;
  model: string;
  latencyMs: number;
  reply?: string;
  error?: string;
}

// 1x1 transparent PNG — exercises the full vision path (image block + parse)
// without needing a real photo, so setup reachability issues surface here.
const PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** Ping the configured provider; used by the Settings "Test connection" button. */
export async function testConnection(): Promise<AiTestResult> {
  const cfg = getAiConfig();
  if (!cfg.model) throw new Error("Set a model before testing the connection.");
  const provider = getProvider(cfg);
  const started = Date.now();
  try {
    const reply = await provider.complete({
      imageBase64: PIXEL_PNG,
      mimeType: "image/png",
      prompt: 'Reply with exactly {"ok":true} and nothing else.',
      timeoutMs: cfg.timeoutMs,
    });
    return {
      ok: true,
      provider: cfg.provider,
      model: cfg.model,
      latencyMs: Date.now() - started,
      reply: reply.slice(0, 200),
    };
  } catch (e) {
    return {
      ok: false,
      provider: cfg.provider,
      model: cfg.model,
      latencyMs: Date.now() - started,
      error: (e as Error).message,
    };
  }
}
