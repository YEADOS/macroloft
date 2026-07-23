/**
 * Pull a JSON value out of a model's raw text. Local models in particular wrap
 * their answer in ```json fences or chatty prose, so we: strip a fenced block,
 * try a straight parse, then scan for the first balanced {...} / [...] (aware of
 * strings + escapes so braces inside quotes don't fool the depth counter).
 */
export function extractJson(raw: string): unknown {
  if (typeof raw !== "string" || raw.trim() === "") throw new Error("empty AI response");
  let s = raw.trim();

  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) s = fence[1].trim();

  try {
    return JSON.parse(s);
  } catch {
    // fall through to the balanced scan
  }

  const starts = [s.indexOf("{"), s.indexOf("[")].filter((i) => i >= 0);
  if (starts.length === 0) throw new Error("no JSON found in AI response");
  const start = Math.min(...starts);
  const open = s[start];
  const close = open === "{" ? "}" : "]";

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return JSON.parse(s.slice(start, i + 1));
  }
  throw new Error("no complete JSON value in AI response");
}
