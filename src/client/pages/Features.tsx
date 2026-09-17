/**
 * A plain running list of what the app does — a memory aid, not marketing.
 * One line per feature: name + a ≤6-word description. Add a tuple to grow it.
 */
const FEATURES: [name: string, desc: string][] = [
  ["Food diary", "Daily log by meal slot"],
  ["Food search", "AFCD + Open Food Facts"],
  ["Saved meals", "Build and reuse combos"],
  ["Meal groups", "Logged-together rows stay one block"],
  ["AI photo estimation", "Snap a plate, get macros"],
  ["Label scanner", "Read macros off a panel"],
  ["Barcode scanner", "Scan packaged foods in"],
  ["Insights", "Trends and macro breakdowns"],
  ["Day timeline", "Entries laid out by time"],
  ["Weight tracking", "Log and chart your weight"],
  ["Targets", "Set daily macro goals"],
  ["Unit converter", "kJ, kcal, lb, kg, in"],
  ["Pepsi Max counter", "Tally cans per day"],
  ["MCP server", "Claude logs food for you"],
  ["Light / dark theme", "Two industrial-loft palettes"],
];

export default function Features() {
  return (
    <div className="max-w-lg">
      <header className="mb-7">
        <div className="plaque">Features</div>
        <h1 className="font-display text-3xl font-black tracking-tight">The Manifest</h1>
      </header>

      <ul>
        {FEATURES.map(([name, desc]) => (
          <li
            key={name}
            className="flex items-baseline gap-3 border-b rule py-3.5 first:pt-0"
          >
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 self-start rounded-full bg-amber" />
            <div className="min-w-0">
              <div className="font-display text-sm font-bold tracking-tight">{name}</div>
              <div className="font-mono text-[11px] text-muted">{desc}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
