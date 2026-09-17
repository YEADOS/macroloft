import { afterEach, beforeAll, describe, expect, test } from "bun:test";

process.env.DB_PATH = `${process.env.TMPDIR ?? "/tmp"}/macroloft-ai-test-${Date.now()}.db`;

const { db } = await import("../db/client");
const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");
const { extractJson } = await import("./ai/extract");
const { getProvider } = await import("./ai/provider");
const config = await import("./ai/config");
const { estimateFoodFromPhoto, estimateFoodFromText } = await import("./vision");

beforeAll(() => {
  migrate(db, { migrationsFolder: `${import.meta.dir}/../../../drizzle` });
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.AI_API_KEY;
});

/** Stub global fetch, capturing the last call, returning `body` as JSON. */
function stubFetch(body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  return calls;
}

describe("extractJson", () => {
  test("parses plain JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  test("strips ```json fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  test("pulls object out of surrounding prose", () => {
    expect(extractJson('Sure! Here you go:\n{"name":"toast","carbsG":50}\nHope that helps.')).toEqual({
      name: "toast",
      carbsG: 50,
    });
  });
  test("ignores braces inside strings", () => {
    expect(extractJson('{"note":"has a } brace"}')).toEqual({ note: "has a } brace" });
  });
  test("throws on garbage", () => {
    expect(() => extractJson("no json here")).toThrow();
    expect(() => extractJson("")).toThrow();
  });
});

describe("config", () => {
  test("env fallback then stored key wins, and masking hides the value", () => {
    process.env.AI_API_KEY = "env-key";
    expect(config.getAiConfig().apiKey).toBe("env-key");
    let masked = config.maskedAiConfig();
    expect(masked.hasKey).toBe(true);
    expect(masked.keyFromEnv).toBe(true);
    expect(masked).not.toHaveProperty("apiKey");

    config.setAiConfig({ apiKey: "stored-key" });
    expect(config.getAiConfig().apiKey).toBe("stored-key");
    masked = config.maskedAiConfig();
    expect(masked.keyFromEnv).toBe(false);

    // Empty apiKey must not wipe the stored key (masked round-trip safety).
    config.setAiConfig({ apiKey: "" });
    expect(config.getAiConfig().apiKey).toBe("stored-key");
  });

  test("provider falls back to openai-compatible for unknown values", () => {
    config.setAiConfig({ provider: "anthropic" });
    expect(config.getAiConfig().provider).toBe("anthropic");
    config.setAiConfig({ provider: "openai-compatible" });
    expect(config.getAiConfig().provider).toBe("openai-compatible");
  });
});

describe("adapters", () => {
  const base = {
    enabled: true,
    baseUrl: "http://gpu-box:11434/v1",
    model: "qwen2.5-vl",
    apiKey: "sk-test",
    timeoutMs: 5000,
  };

  test("openai adapter posts an image_url data URL to /chat/completions", async () => {
    const calls = stubFetch({ choices: [{ message: { content: '{"ok":true}' } }] });
    const provider = getProvider({ ...base, provider: "openai-compatible" });
    const out = await provider.complete({
      images: [{ base64: "AAAA", mimeType: "image/jpeg" }],
      prompt: "hi",
      timeoutMs: 5000,
    });
    expect(out).toBe('{"ok":true}');
    expect(calls[0]!.url).toBe("http://gpu-box:11434/v1/chat/completions");
    const body = JSON.parse(calls[0]!.init.body as string);
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-test");
    expect(body.model).toBe("qwen2.5-vl");
    const parts = body.messages[0].content;
    expect(parts[1].type).toBe("image_url");
    expect(parts[1].image_url.url).toBe("data:image/jpeg;base64,AAAA");
  });

  test("anthropic adapter posts a base64 image block to /v1/messages", async () => {
    const calls = stubFetch({ content: [{ text: '{"ok":true}' }] });
    const provider = getProvider({ ...base, baseUrl: "", provider: "anthropic" });
    const out = await provider.complete({
      images: [{ base64: "BBBB", mimeType: "image/png" }],
      prompt: "hi",
      timeoutMs: 5000,
    });
    expect(out).toBe('{"ok":true}');
    expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    const body = JSON.parse(calls[0]!.init.body as string);
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const block = body.messages[0].content[1];
    expect(block.type).toBe("image");
    expect(block.source).toEqual({ type: "base64", media_type: "image/png", data: "BBBB" });
  });
});

describe("estimateFoodFromPhoto", () => {
  const item = (over: Record<string, unknown> = {}) => ({
    name: "rice cakes",
    quantityG: 40,
    proteinG: 7,
    carbsG: 80,
    fatG: 1,
    ...over,
  });
  const estimate = { name: "rice cakes with honey", items: [item()] };
  const prompt = (calls: { init: RequestInit }[]) =>
    JSON.parse(calls[0]!.init.body as string).messages[0].content[0].text as string;
  const reply = (body: unknown) =>
    stubFetch({ choices: [{ message: { content: JSON.stringify(body) } }] });

  beforeAll(() => {
    config.setAiConfig({
      enabled: true,
      provider: "openai-compatible",
      baseUrl: "http://gpu-box:11434/v1",
      model: "qwen2.5-vl",
      apiKey: "sk-test",
    });
  });

  test("forwards the user's description to the model", async () => {
    const calls = reply(estimate);
    const out = await estimateFoodFromPhoto([{ imageBase64: "data:image/jpeg;base64,AAAA", mimeType: "image/jpeg" }], "  with honey on top  ");
    expect(out.items[0]!.name).toBe("rice cakes");
    const text = prompt(calls);
    expect(text).toContain("with honey on top");
    expect(text).not.toContain("  with honey"); // trimmed
  });

  test("omits the description block when none is given", async () => {
    const calls = reply(estimate);
    await estimateFoodFromPhoto([{ imageBase64: "AAAA", mimeType: "image/jpeg" }], "   ");
    expect(prompt(calls)).not.toContain("The person who took the photo describes it as");
  });

  test("caps an over-long description", async () => {
    const calls = reply(estimate);
    await estimateFoodFromPhoto([{ imageBase64: "AAAA", mimeType: "image/jpeg" }], "x".repeat(900));
    expect(prompt(calls)).toContain("x".repeat(500));
    expect(prompt(calls)).not.toContain("x".repeat(501));
  });

  test("keeps every component the model returns", async () => {
    reply({
      name: "chicken avo wrap",
      items: [
        item({ name: "chicken breast", quantityG: 100, proteinG: 31, carbsG: 0, fatG: 3.6 }),
        item({ name: "avocado", quantityG: 65, proteinG: 2, carbsG: 9, fatG: 15 }),
      ],
    });
    const out = await estimateFoodFromPhoto([{ imageBase64: "AAAA", mimeType: "image/jpeg" }]);
    expect(out.name).toBe("chicken avo wrap");
    expect(out.items.map((i) => i.name)).toEqual(["chicken breast", "avocado"]);
  });

  describe("portion normalisation", () => {
    const only = async (over: Record<string, unknown>) => {
      reply({ items: [item(over)] });
      return (await estimateFoodFromPhoto([{ imageBase64: "AAAA", mimeType: "image/jpeg" }])).items[0]!;
    };

    test("count x unitGrams wins over a per-piece quantityG", async () => {
      // The exact confusion the count line exists to kill: the model counted two
      // wraps but put one wrap's weight in quantityG.
      const out = await only({ unit: "wrap", count: 2, unitGrams: 60, quantityG: 60 });
      expect(out.quantityG).toBe(120);
      expect(out.count).toBe(2);
    });

    test("fills in the missing third of count/unit/unitGrams", async () => {
      expect(await only({ unit: "slice", count: 4, quantityG: 130 })).toMatchObject({
        count: 4,
        unitGrams: 32.5,
        quantityG: 130,
      });
      expect(await only({ unit: "wrap", unitGrams: 60, quantityG: 120 })).toMatchObject({
        count: 2,
        quantityG: 120,
      });
      expect(await only({ unit: "half sandwich", quantityG: 150 })).toMatchObject({
        count: 1,
        unitGrams: 150,
      });
    });

    test("drops a stray count when there is no unit to count", async () => {
      const out = await only({ count: 3, unitGrams: 20, quantityG: 60 });
      expect(out.count).toBeUndefined();
      expect(out.unitGrams).toBeUndefined();
      expect(out.quantityG).toBe(60);
    });
  });

  test("lifts a bare single-food reply into a one-item meal", async () => {
    reply({
      name: "banana",
      proteinG: 1.1,
      carbsG: 23,
      fatG: 0.3,
      servings: [{ name: "as photographed", grams: 118 }],
    });
    const out = await estimateFoodFromPhoto([{ imageBase64: "AAAA", mimeType: "image/jpeg" }]);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({ name: "banana", quantityG: 118 });
  });

  test("retries once, then reports what didn't validate", async () => {
    const calls = stubFetch({ choices: [{ message: { content: "sorry, I can't tell" } }] });
    await expect(estimateFoodFromPhoto([{ imageBase64: "AAAA", mimeType: "image/jpeg" }])).rejects.toThrow(
      /didn't match the expected format/,
    );
    expect(calls).toHaveLength(2);
    expect(calls[1]!.init.body as string).toContain("could not be parsed");
  });

  test("sends every photo as its own image block, with a multi-angle note", async () => {
    const calls = reply(estimate);
    await estimateFoodFromPhoto([
      { imageBase64: "AAAA", mimeType: "image/jpeg" },
      { imageBase64: "BBBB", mimeType: "image/png" },
    ]);
    const parts = JSON.parse(calls[0]!.init.body as string).messages[0].content;
    const images = parts.filter((p: { type: string }) => p.type === "image_url");
    expect(images).toHaveLength(2);
    expect(prompt(calls)).toContain("SAME food from different angles");
  });

  test("no multi-angle note for a single photo", async () => {
    const calls = reply(estimate);
    await estimateFoodFromPhoto([{ imageBase64: "AAAA", mimeType: "image/jpeg" }]);
    expect(prompt(calls)).not.toContain("SAME food from different angles");
  });
});

describe("estimateFoodFromText", () => {
  const estimate = { name: "burger and chips", items: [{ name: "burger", quantityG: 250, proteinG: 15, carbsG: 25, fatG: 20 }] };
  const prompt = (calls: { init: RequestInit }[]) =>
    JSON.parse(calls[0]!.init.body as string).messages[0].content[0].text as string;
  const reply = (body: unknown) =>
    stubFetch({ choices: [{ message: { content: JSON.stringify(body) } }] });

  beforeAll(() => {
    config.setAiConfig({
      enabled: true,
      provider: "openai-compatible",
      baseUrl: "http://gpu-box:11434/v1",
      model: "qwen2.5-vl",
      apiKey: "sk-test",
    });
  });

  test("estimates from words with no image block", async () => {
    const calls = reply(estimate);
    const out = await estimateFoodFromText("a Hungry Jack's storm with small chips");
    expect(out.name).toBe("burger and chips");
    const parts = JSON.parse(calls[0]!.init.body as string).messages[0].content;
    expect(parts.some((p: { type: string }) => p.type === "image_url")).toBe(false);
    expect(prompt(calls)).toContain("a Hungry Jack's storm with small chips");
  });

  test("rejects an empty description", async () => {
    await expect(estimateFoodFromText("   ")).rejects.toThrow(/Describe the food/);
  });
});
