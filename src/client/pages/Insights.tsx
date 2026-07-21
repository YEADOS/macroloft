import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useSummary } from "../lib/api";
import { chartColors, kcal, g, shiftDate, todayStr } from "../lib/format";
import { format, parseISO } from "date-fns";
import Plant from "../components/Plant";

const RANGES = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
] as const;

function StatTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="border rule bg-surface px-4 py-3">
      <div className="plaque">{label}</div>
      <div className="font-display text-3xl font-black tracking-tight" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {sub && <div className="font-mono text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="border rule bg-raised px-3 py-2 font-mono text-xs shadow-lg">
      <div className="plaque">{format(parseISO(label), "EEE d MMM")}</div>
      <div className="mt-1 text-ink">{kcal(d.energyKcal)} kcal</div>
      <div className="text-muted">P{g(d.proteinG)} C{g(d.carbsG)} F{g(d.fatG)}</div>
    </div>
  );
}

export default function Insights() {
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[1]);
  const end = todayStr();
  const start = shiftDate(end, -(range.days - 1));
  const { data } = useSummary(start, end);
  const colors = useMemo(chartColors, [document.documentElement.dataset.theme]);

  const split = data?.macroSplit;

  return (
    <div>
      <header className="mb-5">
        <div className="plaque">Insights</div>
        <h1 className="font-display text-3xl font-black tracking-tight">The Ledger</h1>
      </header>

      {/* filter row */}
      <div className="mb-5 flex gap-1">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r)}
            className={`plaque border rule px-3 py-1.5 ${
              range.key === r.key ? "!text-ink glow" : "hover:!text-ink"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {data && data.loggedDays === 0 && (
        <div className="flex flex-col items-center py-14">
          <Plant className="h-28 w-28" />
          <div className="mt-3 font-mono text-sm text-muted">No entries in this range yet.</div>
        </div>
      )}

      {data && data.loggedDays > 0 && (
        <>
          {/* stat tiles */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <StatTile
              label="Avg intake"
              value={data.averages ? kcal(data.averages.energyKcal) : "—"}
              sub={data.targets ? `target ${kcal(data.targets.energyKcal)}` : undefined}
            />
            <StatTile
              label="vs target"
              value={
                data.adherence
                  ? `${data.adherence.avgVsTargetKcal > 0 ? "+" : ""}${kcal(data.adherence.avgVsTargetKcal)}`
                  : "—"
              }
              sub={
                data.adherence
                  ? `${data.adherence.daysUnderTarget} under · ${data.adherence.daysOverTarget} over`
                  : undefined
              }
              tone={
                data.adherence && data.adherence.avgVsTargetKcal > 0
                  ? "var(--accent-2)"
                  : "var(--positive)"
              }
            />
            <StatTile
              label="Streak"
              value={`${data.currentStreak}d`}
              sub={`${data.loggedDays}/${data.totalDays} days logged`}
            />
            <StatTile
              label="Weight"
              value={
                data.weight.changeOverRangeKg !== null
                  ? `${data.weight.changeOverRangeKg > 0 ? "+" : ""}${data.weight.changeOverRangeKg}kg`
                  : "—"
              }
              sub={
                data.weight.deltaToGoalKg !== null
                  ? `${Math.abs(data.weight.deltaToGoalKg)}kg to goal`
                  : "no weigh-ins"
              }
            />
          </div>

          {/* daily energy bars */}
          <section className="mt-8">
            <div className="flex items-baseline justify-between">
              <h2 className="plaque">Daily energy · kcal</h2>
              {data.targets && (
                <span className="font-mono text-[11px] text-muted">
                  ─ target {kcal(data.targets.energyKcal)}
                </span>
              )}
            </div>
            <div className="mt-3 h-56">
              <ResponsiveContainer>
                <BarChart data={data.days} barCategoryGap={2}>
                  <CartesianGrid vertical={false} stroke={colors.line} strokeOpacity={0.5} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => format(parseISO(d), "d/M")}
                    tick={{ fontSize: 10, fill: colors.muted, fontFamily: "IBM Plex Mono" }}
                    axisLine={{ stroke: colors.line }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    width={36}
                    tick={{ fontSize: 10, fill: colors.muted, fontFamily: "IBM Plex Mono" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: colors.line, opacity: 0.3 }} />
                  {data.targets && (
                    <ReferenceLine
                      y={data.targets.energyKcal}
                      stroke={colors.muted}
                      strokeDasharray="4 4"
                    />
                  )}
                  <Bar
                    dataKey="energyKcal"
                    fill={colors.protein}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={26}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* macro split — single stacked bar with direct labels */}
          {split && data.averages && (
            <section className="mt-8">
              <h2 className="plaque">Avg macro split · % of energy</h2>
              <div className="mt-3 flex h-9 w-full gap-[2px]">
                <div style={{ width: `${split.proteinPct}%`, background: colors.protein }} />
                <div style={{ width: `${split.carbsPct}%`, background: colors.carbs }} />
                <div style={{ width: `${split.fatPct}%`, background: colors.fat }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5" style={{ background: colors.protein }} />
                  Protein {split.proteinPct}% · {g(data.averages.proteinG)}g
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5" style={{ background: colors.carbs }} />
                  Carbs {split.carbsPct}% · {g(data.averages.carbsG)}g
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5" style={{ background: colors.fat }} />
                  Fat {split.fatPct}% · {g(data.averages.fatG)}g
                </span>
              </div>
            </section>
          )}

          {/* table view */}
          <details className="mt-8">
            <summary className="plaque cursor-pointer">Data table</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className="border-b rule text-left text-muted">
                    <th className="py-1.5 pr-4 font-normal">date</th>
                    <th className="pr-4 font-normal">kcal</th>
                    <th className="pr-4 font-normal">protein</th>
                    <th className="pr-4 font-normal">carbs</th>
                    <th className="pr-4 font-normal">fat</th>
                    <th className="font-normal">entries</th>
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((d) => (
                    <tr key={d.date} className="border-b rule/50">
                      <td className="py-1.5 pr-4">{d.date}</td>
                      <td className="pr-4">{kcal(d.energyKcal)}</td>
                      <td className="pr-4">{g(d.proteinG)}</td>
                      <td className="pr-4">{g(d.carbsG)}</td>
                      <td className="pr-4">{g(d.fatG)}</td>
                      <td>{d.entryCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
