import { afterEach, beforeAll, describe, expect, test } from "bun:test";

process.env.DB_PATH = `${process.env.TMPDIR ?? "/tmp"}/macroloft-ai-test-${Date.now()}.db`;

const { db } = await import("../db/client");
const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");
const { extractJson } = await import("./ai/extract");
const { getProvider } = await import("./ai/provider");
const config = await import("./ai/config");

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
      imageBase64: "AAAA",
      mimeType: "image/jpeg",
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
      imageBase64: "BBBB",
      mimeType: "image/png",
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
