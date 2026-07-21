import { NavLink, Route, Routes } from "react-router";
import Diary from "./pages/Diary";
import Foods from "./pages/Foods";
import Insights from "./pages/Insights";
import Weight from "./pages/Weight";
import Goals from "./pages/Goals";

const tabs = [
  { to: "/", label: "Diary", num: "01" },
  { to: "/foods", label: "Foods", num: "02" },
  { to: "/insights", label: "Insights", num: "03" },
  { to: "/weight", label: "Weight", num: "04" },
];

function toggleTheme() {
  const el = document.documentElement;
  const next = el.dataset.theme === "light" ? "dark" : "light";
  el.dataset.theme = next;
  localStorage.setItem("theme", next);
}

export default function App() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl md:gap-10 md:px-8">
      {/* desktop rail */}
      <nav className="sticky top-0 hidden h-dvh w-44 shrink-0 flex-col border-r rule py-10 md:flex">
        <div className="mb-12 px-1">
          <div className="font-display text-xl font-black tracking-tight">
            MACRO<span className="text-amber">LOFT</span>
          </div>
          <div className="plaque mt-1">est. 2026 · bay 12</div>
        </div>
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === "/"}
            className={({ isActive }) =>
              `flex items-baseline gap-3 border-l-2 py-3 pl-4 transition-colors ${
                isActive
                  ? "border-amber text-ink"
                  : "border-transparent text-muted hover:text-ink"
              }`
            }
          >
            <span className="font-mono text-[10px]">{t.num}</span>
            <span className="plaque !text-inherit">{t.label}</span>
          </NavLink>
        ))}
        <div className="mt-auto flex flex-col gap-3 px-1">
          <NavLink to="/goals" className="plaque hover:text-ink">
            ⚙ Targets
          </NavLink>
          <button onClick={toggleTheme} className="plaque text-left hover:text-ink">
            ◐ Light / Dark
          </button>
        </div>
      </nav>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-6 md:px-0 md:pb-16 md:pt-10">
        <Routes>
          <Route path="/" element={<Diary />} />
          <Route path="/foods" element={<Foods />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/weight" element={<Weight />} />
          <Route path="/goals" element={<Goals />} />
        </Routes>
      </main>

      {/* mobile bottom tabs */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t rule md:hidden"
        style={{
          background: "color-mix(in oklab, var(--bg) 92%, transparent)",
          backdropFilter: "blur(8px)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === "/"}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-3 ${
                  isActive ? "text-amber" : "text-muted"
                }`
              }
            >
              <span className="font-mono text-[10px]">{t.num}</span>
              <span className="plaque !text-inherit">{t.label}</span>
            </NavLink>
          ))}
          <NavLink
            to="/goals"
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-3 ${isActive ? "text-amber" : "text-muted"}`
            }
          >
            <span className="font-mono text-[10px]">05</span>
            <span className="plaque !text-inherit">Targets</span>
          </NavLink>
        </div>
      </nav>
    </div>
  );
}
