import type { ScenarioId, ScenarioManifest } from "@goplan/contracts";

interface ScenarioCardProps {
  scenario: ScenarioManifest;
  active: boolean;
  onSelect: (scenarioId: ScenarioId) => void;
}

export function ScenarioCard({ scenario, active, onSelect }: ScenarioCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(scenario.id)}
      className={[
        "w-full rounded-2xl border p-5 text-left transition",
        active
          ? "border-cyan-400 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.3)]"
          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8"
      ].join(" ")}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-white">{scenario.title}</div>
          <div className="mt-1 text-sm text-slate-300">{scenario.description}</div>
        </div>
        <div className="rounded-full bg-white/8 px-3 py-1 text-xs text-slate-200">
          {scenario.estimatedLatencyMs}ms
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {scenario.capabilities.map((item) => (
          <span key={item} className="rounded-full bg-white/6 px-2.5 py-1 text-xs text-slate-200">
            {item}
          </span>
        ))}
      </div>
      <div className="text-sm font-medium text-cyan-300">{scenario.cta}</div>
    </button>
  );
}

