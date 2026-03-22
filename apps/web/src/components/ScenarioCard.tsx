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
      className="n-scenario-card"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="font-serif text-lg font-semibold">{scenario.title}</div>
          <div className="text-secondary mt-1.5 text-sm leading-relaxed">{scenario.description}</div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-1.5 py-1.5 px-3 text-xs shrink-0 bg-surface-gray text-secondary">
          ~{(scenario.estimatedLatencyMs / 1000).toFixed(1)}s
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {scenario.capabilities.map((cap) => (
          <span key={cap} className="inline-flex items-center rounded-1.5 py-0.5 px-2 text-xs leading-4 bg-[var(--notion-tag-blue-bg)] text-[var(--notion-tag-blue-text)]">
            {cap}
          </span>
        ))}
      </div>

      <div className="text-accent-blue text-sm font-medium">{scenario.cta} →</div>
    </button>
  );
}
