# AI Photo Macro Estimation

> Status: **implemented.** Backend provider abstraction + vision service +
> endpoints, MCP tool, frontend photo tab + Settings page, and unit tests are
> all in place. This doc is now the living spec for the feature.
>
> Decisions taken (were "open" below): new **Settings page** (`/settings`);
> **single food per photo** in v1 (multi-item itemization is a fast follow);
> API key stored in the `settings` table **with `AI_API_KEY` env fallback**;
> both `openai-compatible` and `anthropic` adapters shipped, no default provider
> is forced (`ai_enabled=false` until configured).

## 1. Scope

Add a "snap a photo → get name + macros" flow, backed by a **pluggable LLM
provider** (any OpenAI-compatible cloud endpoint, Anthropic, or a **local model
on another machine**). The estimate is always editable before it's saved — it
prefills the existing New Food form, which *is* the override UI.

Three layers, built in this order:

1. **Provider abstraction** (backend) — one config, any provider.
2. **Vision service + endpoint** — photo in, validated `CreateFoodInput` out.
3. **Frontend capture tab + config UI**, then the **MCP tool** mirror.

## 2. Architecture decisions (proposed)

| Decision | Choice | Why |
|---|---|---|
| Provider surface | Two adapters: `openai-compatible` + `anthropic` | Covers OpenAI, OpenRouter, Groq, DeepSeek, Together, Gemini-compat, **Ollama/LM Studio/vLLM/llama.cpp**, and Claude |
| Where AI logic lives | New `src/server/services/vision.ts` + `services/ai/` | Follows the rule: routes/MCP stay thin wrappers |
| Config storage | `settings` table (existing K/V) | Editable in UI, no migration; key can fall back to env |
| Output contract | Reuse the existing `foodBody` Zod schema | Model output validates through the exact path `createCustomFood` already trusts |
| Persistence | Endpoint returns a **draft**, saves nothing | Override-before-save; reuses existing `POST /foods` |
| Cross-machine networking | Tailscale MagicDNS name in `ai_base_url` | Cross-machine networking is already solved for the whole app |

## 3. Config (settings keys)

Add to the `DEFAULTS` map in `src/server/services/settings.ts` and manage via a
small typed helper `getAiConfig()`:

```
ai_enabled      = "false"
ai_provider     = "openai-compatible" | "anthropic"
ai_base_url     = "https://openrouter.ai/api/v1"   # or local: http://gpu-box.<tailnet>.ts.net:11434/v1
ai_model        = "google/gemini-3-flash-preview"  # reference; or a local model / claude-… etc.
ai_api_key      = ""                                # sk-or-… for OpenRouter; empty for local; env fallback below
ai_timeout_ms   = "60000"                           # local vision can be slow
```

**Reference cloud setup:** OpenRouter (one key, OpenAI-compatible, any model via
the `model` string) with `google/gemini-3-flash-preview` — best food-recognition
quality per cent as of writing (~$0.001/photo). Note portion/weight estimation is
the inherent hard part for *any* vision model, which is exactly why the estimate
is always editable. Swapping models is just changing `ai_model` — no redeploy.

**API key handling:** read `ai_api_key` from settings first, fall back to
`process.env.AI_API_KEY`. Store in DB so it's UI-editable; note that SQLite
storage is plaintext — acceptable under the existing no-auth / tailnet-is-the-
boundary threat model, but a conscious choice. Never return the key in GET
responses (mask it).

## 4. Backend — provider abstraction

**`src/server/services/ai/provider.ts`**

```ts
export interface VisionRequest {
  imageBase64: string;      // raw b64, no data: prefix (vision.ts strips it)
  mimeType: string;         // image/jpeg | image/png | image/webp
  prompt: string;           // the full instruction incl. the JSON shape we want
  timeoutMs: number;
}
export interface AiProvider {
  complete(req: VisionRequest): Promise<string>;  // raw model text
}
export function getProvider(cfg: AiConfig): AiProvider; // switch on cfg.provider
```

`baseUrl`/`model`/`apiKey`/`timeoutMs` come from `AiConfig` closed over by
`getProvider`; the request only carries the per-call image + prompt. HTTP with a
hard timeout lives in `services/ai/fetch.ts` (`postJson`).

- **`openai.ts`** — POST `{baseURL}/chat/completions`, messages with
  `image_url: data:${mime};base64,…`. Works for cloud *and* every local runner.
  Request `response_format: {type:"json_object"}` when supported; tolerate
  providers that ignore it.
- **`anthropic.ts`** — Messages API, `image` content block with base64 source.

Keep both dependency-free (plain `fetch`) — no SDK needed, keeps the container
lean and avoids coupling to one vendor.

## 5. Backend — vision service

**`src/server/services/vision.ts`**

```ts
export async function estimateFoodFromPhoto(
  imageBase64: string, mimeType: string,
): Promise<{ food: CreateFoodInput; note?: string }> {
  const cfg = getAiConfig();
  if (!cfg.enabled) throw new Error("AI estimation is off — enable it in Settings…");
  const raw = await getProvider(cfg).complete({ ...prompt, image… });
  const parsed = extractJson(raw);                 // lenient: strip fences/prose
  const result = foodInputSchema.safeParse(parsed); // reuse the REAL schema
  if (!result.success) { /* one retry with stricter reminder */ }
  return { food: result.data, note: parsed.note }; // note = short assumption line
}
```

`foodInputSchema` (the shared Zod food shape) lives in `services/foods.ts`; REST
`POST /foods`, MCP `create_food`, and this service all validate through it, so a
model draft can only reach the DB via the exact path `createCustomFood` trusts.
The `note` is surfaced in the UI banner but isn't part of the food schema.

- **Prompt** asks for: `name`, `brand?`, per-100g macros, **and** a suggested
  `servings[]` entry describing the plate portion (e.g.
  `{name:"as photographed", grams:350}`) plus a short assumption note. Per-100g
  keeps it consistent with how the DB stores everything; the serving lets the
  user correct *one* number instead of four.
- **Itemize option:** prompt can return an array of component foods for mixed
  plates (better than one blended number, and fits the one-row-per-food model).
  v1 can do single-item; multi-item is a fast follow.
- **Robustness:** `extractJson` handles the local-model reality (markdown
  fences, trailing prose). One retry on parse failure. Don't rely on
  tool-calling — many local models lack it.

## 6. Backend — endpoint

In `src/server/api/index.ts` (thin wrappers, per the rules):

```
POST /api/ai/estimate   {imageBase64, mimeType} JSON → 200 {food, note} draft
GET  /api/ai/config     → config with key masked (hasKey/keyFromEnv, never the key)
PUT  /api/ai/config     → update settings (empty apiKey = keep stored key)
POST /api/ai/test       → ping provider, return ok/latency/model  (nice for local setup)
```

(base64 JSON only — the client downscales to a JPEG data URL before upload, so
multipart was unnecessary.)

`onError` already maps thrown errors to JSON 400s, so service-layer
`throw new Error(...)` surfaces cleanly.

## 7. Frontend — capture flow

`AddSheet.tsx` already has the tab pattern
(`type Tab = "search" | "quick" | "meals" | "new"`) and a full-screen overlay
precedent in `BarcodeScanner.tsx`.

- **Add a `"photo"` tab** → "Snap a meal". Reuse the barcode overlay pattern for
  a `PhotoCapture.tsx` (or simplest v1:
  `<input type="file" accept="image/*" capture="environment">`, which opens the
  native camera on mobile — the primary platform — with zero `getUserMedia`
  code).
- On capture → downscale client-side (canvas, ~1024px longest edge, JPEG ~0.8)
  to cut upload + token cost → `POST /ai/estimate` → show "Estimating…" state
  (local inference is 10–60s; cloud 2–5s).
- On result → **prefill the existing New Food form state (`nf`)** and switch to
  the `"new"` tab with a banner: "AI estimate — check and edit before saving."
  User edits name/macros/serving, hits the existing create path. **No new save
  logic.**
- Failure → friendly inline error (reuse the `error` state), fall back to manual
  entry.

**Config UI:** small "AI" section — either on the Goals page or a new
lightweight Settings page — with provider dropdown, base URL, model, key
(masked), a "Test connection" button hitting `/ai/test`, and an enable toggle.
Must follow `docs/UI-THEME.md` tokens (neutral chips, no library styling).

## 8. MCP tool (mirror)

Once the service exists, register one tool in `src/server/mcp/index.ts`:

```
estimate_food_from_photo(image_base64, mime_type) → draft food JSON
```

Thin wrapper over `vision.estimateFoodFromPhoto`. Description makes clear it
returns an *unsaved estimate* the caller should confirm before
`create_food`/`log_food`. Lets you photo-log via Claude too.

## 9. Networking for the local/remote LLM

- **Recommended:** put the GPU box on the tailnet, set `ai_base_url` to its
  MagicDNS name (`http://gpu-box.<tailnet>.ts.net:11434/v1`). Works from inside
  the container regardless of Docker bridge networking.
- **Pure LAN alternative:** reachable only if the container can hit the LAN IP
  and the runner binds `0.0.0.0` (Ollama defaults to `127.0.0.1` — needs
  `OLLAMA_HOST=0.0.0.0`). The Tailscale route avoids this.
- The `/ai/test` endpoint is what you'll use to debug reachability during setup.

## 10. Testing

- **Unit:** `extractJson` (fenced/prose/valid/garbage), `getProvider` switch,
  config get/set with env fallback, key masking. Follows the existing
  `services.test.ts` / `bun test` setup.
- **Adapter tests:** mock `fetch`, assert request shape per provider (image
  block format differs OpenAI vs Anthropic).
- **No live-model tests** in CI (non-deterministic, needs keys); one manual
  smoke checklist in this doc.

## 11. Docs to update (per the "keep it truthful" rule)

- This `docs/AI-PHOTO.md` (provider matrix, config keys, local-model setup,
  prompt).
- `CLAUDE.md`: note the new service, endpoint group, MCP tool count (22→23), and
  the `AI_API_KEY` env var / settings keys.
- `docker/compose.yml`: optional `AI_API_KEY` env passthrough (commented).

## 12. Milestones

1. **M1 — Backend spine:** config helper + `openai-compatible` adapter +
   `vision.ts` + `POST /ai/estimate` + `/ai/test`. Testable via curl against
   Ollama.
2. **M2 — Frontend:** photo tab, file-capture + downscale, prefill New Food
   form, AI settings section.
3. **M3 — Breadth:** Anthropic adapter, MCP tool, multi-item plate itemization,
   docs.

M1+M2 is a working single-provider-configurable v1 in ~one focused session; M3
is the "+half session" breadth.

## 13. Open decisions

1. **Config UI home** — bolt onto Goals page, or a new Settings page? (Lean: new
   small Settings page, since AI + units + timezone all belong there.)
2. **v1 scope** — single food per photo, or itemize mixed plates from day one?
   (Lean: single first.)
3. **Default provider to document** — which local model / cloud fallback as the
   reference setup? (e.g. `qwen2.5-vl` locally, OpenRouter as cheap cloud
   fallback.)
4. **Key storage** — settings-table (UI-editable, plaintext in SQLite) vs
   env-only (more private, needs redeploy to change). (Lean: settings with env
   fallback.)
