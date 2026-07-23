/** POST JSON with a hard timeout; throws a readable error on non-2xx or abort. */
export async function postJson(
  url: string,
  opts: { headers: Record<string, string>; body: unknown; timeoutMs: number },
): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...opts.headers },
      body: JSON.stringify(opts.body),
      signal: ctrl.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError")
      throw new Error(`AI request timed out after ${opts.timeoutMs}ms`);
    throw new Error(`could not reach AI provider at ${url}: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`AI provider returned ${res.status}: ${text.slice(0, 500)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`AI provider returned non-JSON: ${text.slice(0, 200)}`);
  }
}
