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
      role="option"
      aria-selected={active}
      onClick={() => onSelect(scenario.id)}
      className={`n-glass-card n-scenario-card p-6 flex flex-col h-full group border-solid transition-all ${active ? "border-accent-indigo ring-1 ring-accent-indigo bg-surface-hover" : "border-edge"}`}
    >
      <div className="mb-5 flex items-start justify-between gap-4 w-full text-left">
        <div>
          <div className="text-xl font-bold text-primary group-hover:text-accent-indigo transition-colors">{scenario.title}</div>
          <div className="text-secondary mt-2 text-sm leading-relaxed">{scenario.description}</div>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 mt-auto">
        {scenario.capabilities.map((cap) => (
          <span key={cap} className="inline-flex items-center rounded-md py-0.5 px-2 text-[10px] font-bold bg-surface-gray text-secondary uppercase tracking-wider border border-solid border-edge">
            {cap}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between w-full mt-auto pt-4 border-none">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-bold shrink-0 text-tertiary uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-green"></span>
          ~{(scenario.estimatedLatencyMs / 1000).toFixed(1)}s
        </div>
        <div className="text-accent-indigo text-xs font-bold flex items-center gap-1 group-hover:gap-2 transition-all uppercase tracking-widest">
          {scenario.cta} <span>→</span>
        </div>
      </div>
    </button>
  );
}
