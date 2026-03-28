import { Icon } from "@iconify/react";
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
      className={`relative p-8 flex flex-col h-full group transition-all duration-700 ease-[cubic-bezier(0.19,1,0.22,1)] rounded-3xl overflow-hidden border ${active ? "bg-accent-indigo/10 dark:bg-accent-indigo/15 border-accent-indigo/40 shadow-[0_20px_50px_-12px_rgba(139,92,246,0.15)] ring-1 ring-accent-indigo/20" : "bg-surface/50 border-white/5 hover:bg-surface-hover/80 hover:border-white/10 hover:-translate-y-1"}`}
    >
      <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
        <Icon icon={scenario.id === "run_tomorrow" ? "lucide:wind" : "lucide:camera"} className="text-6xl text-accent-indigo" />
      </div>

      <div className="mb-6 flex flex-col items-start gap-4 w-full text-left relative z-10">
        <h3 className="text-3xl font-bold text-primary group-hover:text-accent-indigo transition-colors duration-500 tracking-tight">
          {scenario.title}
        </h3>
        <p className="text-secondary/90 text-[15px] leading-relaxed max-w-[95%] font-medium">
          {scenario.description}
        </p>
      </div>

      <div className="mb-10 flex flex-wrap gap-2 mt-auto relative z-10">
        {scenario.capabilities.map((cap) => (
          <span key={cap} className="inline-flex items-center gap-1.5 rounded-lg py-1.5 px-3 text-[11px] font-bold bg-white/5 text-secondary/80 border border-white/5 transition-all group-hover:bg-accent-indigo/5 group-hover:text-accent-indigo group-hover:border-accent-indigo/10">
            {cap}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between w-full mt-auto pt-6 border-t border-white/10 relative z-10">
        <div className="inline-flex items-center gap-2.5 text-[11px] font-bold shrink-0 text-tertiary uppercase tracking-[0.15em]">
          <div className="w-1.5 h-1.5 rounded-full bg-accent-green/80 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
          推演耗时 ~{(scenario.estimatedLatencyMs / 1000).toFixed(1)}s
        </div>
        <div className="text-accent-indigo text-[13px] font-bold flex items-center gap-2 transition-all uppercase tracking-widest group-hover:gap-3">
          {scenario.cta} 
          <Icon icon="lucide:arrow-right" className="text-lg transition-transform duration-500 ease-[cubic-bezier(0.19,1,0.22,1)]" />
        </div>
      </div>
    </button>
  );
}
