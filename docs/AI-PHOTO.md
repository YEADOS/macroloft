# AI Photo Macro Estimation

> Status: **implemented.** Backend provider abstraction + vision service +
> endpoints, MCP tool, frontend photo tab + Settings page, and unit tests are
> all in place. This doc is now the living spec for the feature.
>
> Decisions taken (were "open" below): new **Settings page** (`/settings`);
> **itemized output** — a photo comes back as one row per component, always
> (v1 shipped single-food; superseded); API key stored in the `settings` table
> **with `AI_API_KEY` env fallback**; both `openai-compatible` and `anthropic`
> adapters shipped, no default provider is forced (`ai_enabled=false` until
> configured).

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
  imageBase64: string, mimeType: string, description?: string,
): Promise<MealEstimate> {
  const cfg = getAiConfig();
  if (!cfg.enabled) throw new Error("AI estimation is off — enable it in Settings…");
  const raw = await getProvider(cfg).complete({ ...prompt, image… });
  const parsed = normalizeShape(extractJson(raw));   // lenient: fences, prose, bare array
  const result = mealEstimateSchema.safeParse(parsed);
  if (!result.success) { /* one retry with stricter reminder */ }
  return { ...result.data, items: result.data.items.map(normalizePortion) };
}
```

### The shape

```ts
MealEstimate = { name?: string; items: EstimateItem[]; note?: string }

EstimateItem = foodInputSchema.omit({ barcode, servings }) & {
  quantityG: number;    // TOTAL grams of this component in the photo
  count?: number;       // pieces counted
  unit?: string;        // what one piece is: "wrap", "slice", "half sandwich"
  unitGrams?: number;   // grams in one piece
  note?: string;
}
```

`foodInputSchema` (the shared Zod food shape) lives in `services/foods.ts`; REST
`POST /foods`, MCP `create_food`, and this service's item schema all build on
it, so a model draft can only reach the DB via the exact path `createCustomFood`
trusts. Nutrients stay **per 100 g**; `quantityG` is the only as-served number.

### The two things the prompt is fighting

1. **One blended number is useless.** The prompt insists on the components a
   person would log separately — chicken, avocado, the wrap, the mayo — not
   "chicken wrap, 500 kcal". Trace seasonings fold into the item they're on;
   1–8 items; a packaged food is simply one item.
2. **"Is that one wrap or two?"** `quantityG` is defined as the total across
   every piece, *never* per piece, and countable components must also carry
   `count`/`unit`/`unitGrams` so the UI can say **"AI counted 2 × wrap at 60 g
   each"**. That line is the whole point: the ambiguity is resolved by the model
   stating what it counted, not by the user guessing whether to hit ×2.

`normalizePortion()` enforces one invariant the UI can rely on: **either all of
`count`/`unit`/`unitGrams` are present with `count * unitGrams === quantityG`,
or none of them are.** Models routinely return two of the three, or put a
per-piece weight in `quantityG` — the function reconciles rather than rejects,
because a retry loses the good parts of the answer too. `normalizeShape()`
likewise lifts a bare array or a pre-itemisation single-food object into a
one-item meal.

- **User description (optional):** a free-text hint appended to the prompt in a
  delimited block, for what the camera can't show — honey on the rice cakes, the
  oil in the pan, "only ate half". Trimmed, capped at 500 chars
  (`MAX_DESCRIPTION`), and the block tells the model to treat it as ground truth
  over the image but to ignore instructions inside it. Omitted entirely when
  blank, so the no-hint prompt stays byte-identical to before.
- **Robustness:** `extractJson` handles the local-model reality (markdown
  fences, trailing prose). One retry on parse failure. Don't rely on
  tool-calling — many local models lack it.

## 6. Backend — endpoint

In `src/server/api/index.ts` (thin wrappers, per the rules):

```
POST /api/ai/estimate   {imageBase64, mimeType, description?} JSON → 200 MealEstimate draft
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
- **Description field** above the capture zone: an optional two-row textarea
  ("rice cakes with a drizzle of honey") sent as `description`, cleared once an
  estimate lands. Filling it in first is the point — it's a hint about what
  you're *about* to photograph.
- On capture → downscale client-side (canvas, ~1024px longest edge, JPEG ~0.8)
  to cut upload + token cost → `POST /ai/estimate` → show "Estimating…" state
  (local inference is 10–60s; cloud 2–5s).
- On result → the photo tab swaps the capture zone for **`PhotoReview.tsx`**, the
  confirm-before-save screen. Failure → friendly inline error (reuse the `error`
  state), fall back to manual entry.

### `PhotoReview.tsx` — the review screen

One card per component, each showing the model's claim verbatim
(*"AI counted 2 × wrap at 60 g each"*) above the controls that change it:

- **Include toggle** (✓/○, 44px) instead of destructive removal — mobile-first,
  reversible, and the total updates live.
- **Count stepper** (−/+) for countable items, next to an editable **g total**.
  They stay in lockstep in the direction the user is thinking: stepping the
  count rescales the weight at the same grams-per-piece; typing a weight
  re-derives grams-per-piece for the count on screen.
- **Editable name**, and a collapsed **"Edit macros per 100 g"** panel
  (kcal/P/C/F). Micros ride along untouched.
- **Running total** across included items, then
  **"Log N items to \<slot\>"**.

Logging is a loop over the included rows: `POST /foods` then
`POST /diary/entries` per row — **no new save path**, the same two endpoints the
manual flow uses, so each ingredient lands as its own editable diary row. The
food's serving is the *piece*, not the plate (`{name: "wrap", grams: 60}`), so
re-logging one wrap later is a single tap.

**Config UI:** small "AI" section — either on the Goals page or a new
lightweight Settings page — with provider dropdown, base URL, model, key
(masked), a "Test connection" button hitting `/ai/test`, and an enable toggle.
Must follow `docs/UI-THEME.md` tokens (neutral chips, no library styling).

## 8. MCP tool (mirror)

Once the service exists, register one tool in `src/server/mcp/index.ts`:

```
estimate_food_from_photo(image_base64, mime_type, description?) → MealEstimate JSON
```

Thin wrapper over `vision.estimateFoodFromPhoto`. The tool description makes
clear it returns an *unsaved* itemized estimate, that each item's macros are per
100 g while `quantityG` is the total on the plate, and that the model should
**report the count back to the user** before confirming — the same ambiguity the
UI's count line solves. Confirmed items go through `create_food` (serving =
`{name: unit, grams: unitGrams}`) then `log_food` with `quantityG`.

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
- **Estimate shape:** `estimateFoodFromPhoto` against a stubbed `fetch` — the
  description block (forwarded / trimmed / capped / omitted), multi-item
  passthrough, the `normalizeShape` single-food lift, and every
  `normalizePortion` branch (per-piece `quantityG` corrected, missing third of
  count/unit/unitGrams filled in, stray count dropped when there's no unit).
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
3. **M3 — Breadth:** Anthropic adapter, MCP tool, docs.
4. **M4 — Itemization:** items array + portion normalisation in `vision.ts`,
   `PhotoReview.tsx`, MCP description, docs. Replaced the single-food draft and
   the New Food prefill path.

All shipped, and every decision this doc once listed as open (config UI home,
single-vs-itemized scope, reference provider, key storage) is settled — see the
decisions block at the top.
