import type { ScenarioId, ScenarioManifest } from "@goclaw/contracts";

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
      className={`n-glass-card n-scenario-card p-6 flex flex-col h-full group border-solid transition-all duration-500 ease-[cubic-bezier(0.19,1,0.22,1)] ${active ? "bg-accent-indigo/10 border-accent-indigo/40 ring-1 ring-accent-indigo/20" : "border-white/5"}`}
    >
      <div className="mb-5 flex flex-col items-start gap-4 w-full text-left">
        <div className="text-2xl sm:text-3xl font-bold text-primary group-hover:text-accent-indigo transition-colors duration-500">
          {scenario.title}
        </div>
        <div className="text-secondary/80 text-sm leading-relaxed max-w-[90%] font-medium">
          {scenario.description}
        </div>
      </div>

      <div className="mb-8 flex flex-wrap gap-2 mt-auto">
        {scenario.capabilities.map((cap) => (
          <span key={cap} className="inline-flex items-center gap-1.5 rounded-full py-1 px-3 text-[10px] font-bold bg-white/5 text-secondary uppercase tracking-widest border border-white/5 transition-colors group-hover:bg-white/10">
            <span className="w-1 h-1 rounded-full bg-accent-indigo/60"></span>
            {cap}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between w-full mt-auto pt-4 border-t border-white/5">
        <div className="inline-flex items-center gap-2 text-[10px] font-bold shrink-0 text-tertiary uppercase tracking-widest">
          <div className="relative flex items-center justify-center">
            <span className="absolute w-2 h-2 rounded-full bg-accent-green/40 animate-ping"></span>
            <span className="relative w-1.5 h-1.5 rounded-full bg-accent-green"></span>
          </div>
          ~{(scenario.estimatedLatencyMs / 1000).toFixed(1)}s
        </div>
        <div className="text-accent-indigo text-xs font-bold flex items-center gap-1.5 transition-all uppercase tracking-widest">
          {scenario.cta} 
          <span className="group-hover:translate-x-1.5 transition-transform duration-500 ease-[cubic-bezier(0.19,1,0.22,1)]">
            →
          </span>
        </div>
      </div>
    </button>
  );
}
