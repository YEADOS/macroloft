import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiLogWeight, useWeight } from "../lib/api";
import { chartColors, shiftDate, todayStr } from "../lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import Plant from "../components/Plant";

const RANGES = [
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "1y", label: "1 year", days: 365 },
] as const;

function WeightTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="border rule bg-raised px-3 py-2 font-mono text-xs shadow-lg">
      <div className="plaque">{format(parseISO(label), "EEE d MMM")}</div>
      <div className="mt-1 text-ink">{d.weightKg} kg</div>
      <div className="text-muted">trend {d.trendKg} kg</div>
    </div>
  );
}

export default function Weight() {
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[0]);
  const end = todayStr();
  const start = shiftDate(end, -(range.days - 1));
  const { data } = useWeight(start, end);
  const qc = useQueryClient();
  const colors = useMemo(chartColors, [document.documentElement.dataset.theme]);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const domain = useMemo(() => {
    if (!data?.entries.length) return ["auto", "auto"] as const;
    const vals = data.entries.map((e) => e.weightKg);
    if (data.goalWeightKg) vals.push(data.goalWeightKg);
    return [Math.floor(Math.min(...vals) - 1), Math.ceil(Math.max(...vals) + 1)] as const;
  }, [data]);

  return (
    <div>
      <header className="mb-5 flex items-end justify-between">
        <div>
          <div className="plaque">Weight</div>
          <h1 className="font-display text-3xl font-black tracking-tight">The Scales</h1>
        </div>
        {data?.current && (
          <div className="text-right">
            <div className="font-display text-5xl font-black leading-none">{data.current}</div>
            <div className="plaque mt-1">
              kg{data.deltaToGoalKg !== null && ` · ${Math.abs(data.deltaToGoalKg)} to goal`}
            </div>
          </div>
        )}
      </header>

      {/* log form */}
      <div className="mb-6 flex gap-2 border-b rule pb-6">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Today's weight, kg"
          className="w-44 font-mono"
        />
        <button
          disabled={busy || !Number(input)}
          onClick={async () => {
            setBusy(true);
            try {
              await apiLogWeight({ weightKg: Number(input) });
              setInput("");
              qc.invalidateQueries({ queryKey: ["weight"] });
              qc.invalidateQueries({ queryKey: ["summary"] });
            } finally {
              setBusy(false);
            }
          }}
          className="glow px-5 font-display text-sm font-bold uppercase tracking-wider disabled:opacity-40"
          style={{ background: "var(--accent)", color: "#181614" }}
        >
          Log
        </button>
      </div>

      <div className="mb-4 flex gap-1">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r)}
            className={`plaque border rule px-3 py-1.5 ${range.key === r.key ? "!text-ink glow" : "hover:!text-ink"}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {data && data.entries.length === 0 && (
        <div className="flex flex-col items-center py-14">
          <Plant className="h-28 w-28" />
          <div className="mt-3 font-mono text-sm text-muted">No weigh-ins yet — log one above.</div>
        </div>
      )}

      {data && data.entries.length > 0 && (
        <>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={data.entries}>
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
                  domain={domain as unknown as [number, number]}
                  tick={{ fontSize: 10, fill: colors.muted, fontFamily: "IBM Plex Mono" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<WeightTooltip />} />
                {data.goalWeightKg && (
                  <ReferenceLine y={data.goalWeightKg} stroke={colors.green} strokeDasharray="4 4" />
                )}
                <Line
                  type="monotone"
                  dataKey="weightKg"
                  stroke={colors.muted}
                  strokeWidth={0}
                  dot={{ r: 2.5, fill: colors.muted, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="trendKg"
                  stroke={colors.protein}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex gap-6 font-mono text-xs">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-[2px] w-4" style={{ background: colors.protein }} />
              7-day trend
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: colors.muted }} />
              weigh-ins
            </span>
            {data.goalWeightKg && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-[2px] w-4" style={{ background: colors.green }} />
                goal {data.goalWeightKg} kg
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
