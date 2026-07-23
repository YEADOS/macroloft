import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiSetAiConfig, apiTestAi, useAiConfig, type AiTestResult } from "../lib/api";

const PROVIDERS = [
  ["openai-compatible", "OpenAI-compatible"],
  ["anthropic", "Anthropic"],
] as const;

export default function Settings() {
  const { data } = useAiConfig();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    enabled: false,
    provider: "openai-compatible" as "openai-compatible" | "anthropic",
    baseUrl: "",
    model: "",
    timeoutMs: "60000",
  });
  // The key input is write-only: it starts blank and only sends when typed, so
  // it never displays or overwrites the stored key by accident.
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<AiTestResult | null>(null);

  useEffect(() => {
    if (data)
      setForm({
        enabled: data.enabled,
        provider: data.provider,
        baseUrl: data.baseUrl,
        model: data.model,
        timeoutMs: String(data.timeoutMs),
      });
  }, [data]);

  const openai = form.provider === "openai-compatible";

  const save = async () => {
    setError(null);
    setTest(null);
    try {
      await apiSetAiConfig({
        enabled: form.enabled,
        provider: form.provider,
        baseUrl: form.baseUrl,
        model: form.model,
        timeoutMs: Number(form.timeoutMs) || 60000,
        apiKey: apiKey || undefined,
      });
      setApiKey("");
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["aiConfig"] });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    setError(null);
    try {
      // Test the saved config, so persist first.
      await save();
      setTest(await apiTestAi());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const keyPlaceholder = data?.keyFromEnv
    ? "set via AI_API_KEY env — leave blank to keep"
    : data?.hasKey
      ? "•••••••• stored — leave blank to keep"
      : openai
        ? "optional for local models"
        : "required";

  return (
    <div className="max-w-lg">
      <header className="mb-6">
        <div className="plaque">Settings</div>
        <h1 className="font-display text-3xl font-black tracking-tight">The Control Room</h1>
      </header>

      <section className="space-y-5">
        <div className="flex items-start justify-between gap-4 border-b rule pb-5">
          <div>
            <h2 className="plaque mb-1">AI photo estimation</h2>
            <p className="font-mono text-[11px] text-muted">
              Snap a meal and let a vision model draft its name and macros. Runs
              against any OpenAI-compatible endpoint (incl. a local model over
              Tailscale) or Anthropic.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.enabled}
            onClick={() => { setForm({ ...form, enabled: !form.enabled }); setSaved(false); }}
            className="mt-1 flex h-7 w-12 shrink-0 items-center rounded-full border rule px-0.5 transition-colors"
            style={{ background: form.enabled ? "var(--accent)" : "transparent" }}
          >
            <span
              className="h-5 w-5 rounded-full transition-transform"
              style={{
                background: form.enabled ? "#181614" : "var(--text-muted)",
                transform: form.enabled ? "translateX(20px)" : "translateX(0)",
              }}
            />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <span className="plaque">Provider</span>
          <div className="inline-flex w-fit border rule font-mono text-[11px]">
            {PROVIDERS.map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => { setForm({ ...form, provider: v }); setSaved(false); }}
                className={`px-3 py-1.5 ${form.provider === v ? "bg-raised text-ink" : "text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="plaque">
            Base URL {openai ? "" : "(optional — defaults to api.anthropic.com)"}
          </span>
          <input
            value={form.baseUrl}
            onChange={(e) => { setForm({ ...form, baseUrl: e.target.value }); setSaved(false); }}
            placeholder={
              openai ? "https://openrouter.ai/api/v1" : "https://api.anthropic.com"
            }
            className="font-mono text-sm"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="plaque">Model</span>
          <input
            value={form.model}
            onChange={(e) => { setForm({ ...form, model: e.target.value }); setSaved(false); }}
            placeholder={openai ? "google/gemini-3-flash-preview" : "claude-sonnet-5"}
            className="font-mono text-sm"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="plaque">API key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setSaved(false); }}
              placeholder={keyPlaceholder}
              className="font-mono text-sm"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="plaque">Timeout (ms)</span>
            <input
              type="number"
              inputMode="numeric"
              value={form.timeoutMs}
              onChange={(e) => { setForm({ ...form, timeoutMs: e.target.value }); setSaved(false); }}
              className="font-mono text-sm"
            />
          </label>
        </div>

        {error && (
          <div className="font-mono text-xs" style={{ color: "var(--accent-2)" }}>
            {error}
          </div>
        )}

        {test && (
          <div
            className="border rule p-3 font-mono text-xs"
            style={{ color: test.ok ? "var(--accent)" : "var(--accent-2)" }}
          >
            {test.ok
              ? `✓ Connected to ${test.model} in ${test.latencyMs} ms`
              : `✕ ${test.error}`}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={save}
            className="glow flex-1 py-2.5 font-display text-sm font-bold uppercase tracking-wider"
            style={{ background: "var(--accent)", color: "#181614" }}
          >
            {saved ? "Saved ✓" : "Save"}
          </button>
          <button
            onClick={runTest}
            disabled={testing || !form.model}
            className="border rule px-4 py-2.5 font-mono text-xs text-muted active:bg-raised disabled:opacity-40 md:hover:text-ink"
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
        </div>
        <p className="font-mono text-[11px] text-muted">
          The key is stored in the app database (plaintext, on the tailnet) or read
          from the <span className="text-timber">AI_API_KEY</span> env var. Local
          models usually need no key.
        </p>
      </section>
    </div>
  );
}
