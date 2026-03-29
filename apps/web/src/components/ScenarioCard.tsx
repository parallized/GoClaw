import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import type { ScenarioId, ScenarioManifest } from "@goclaw/contracts";

interface ScenarioCardProps {
  scenario: ScenarioManifest;
  active: boolean;
  onSelect: (scenarioId: ScenarioId) => void;
}

export function ScenarioCard({ scenario, active, onSelect }: ScenarioCardProps) {
  return (
    <motion.button
      type="button"
      role="option"
      aria-selected={active}
      onClick={() => onSelect(scenario.id)}
      className="n-glass-card n-scenario-card p-8 flex flex-col h-full w-full text-left relative overflow-hidden group border-solid"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -8, scale: 1.015 }}
      whileTap={{ scale: 0.985 }}
      transition={{ 
        type: "spring", 
        stiffness: 500, 
        damping: 30 
      }}
    >
      <div className="absolute top-0 right-0 p-6 z-0 opacity-10">
        <Icon icon={scenario.id === "run_tomorrow" ? "lucide:wind" : "lucide:camera"} className="text-6xl text-accent-indigo" />
      </div>

      <div className="mb-6 flex flex-col items-start gap-4 w-full relative z-10">
        <h3 className="text-3xl font-bold text-primary tracking-tight">
          {scenario.title}
        </h3>
        <p className="text-secondary text-[15px] leading-relaxed max-w-[95%] font-medium">
          {scenario.description}
        </p>
      </div>

      <div className="mb-10 flex flex-wrap gap-2 mt-auto relative z-10">
        {scenario.capabilities.map((cap) => (
          <span key={cap} className="inline-flex items-center gap-1.5 rounded-lg py-1.5 px-3 text-[11px] font-bold bg-white/10 text-white border border-white/5 transition-none">
            {cap}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between w-full mt-auto pt-6 border-t border-edge relative z-10">
        <div className="inline-flex items-center gap-2.5 text-[11px] font-bold shrink-0 text-tertiary uppercase tracking-[0.15em]">
          <div className="w-1.5 h-1.5 rounded-full bg-accent-green/60"></div>
          推演耗时 ~{(scenario.estimatedLatencyMs / 1000).toFixed(1)}s
        </div>
        <div className="text-accent-indigo text-[13px] font-bold flex items-center gap-2 uppercase tracking-widest group-hover:translate-x-1">
          {scenario.cta}
          <Icon icon="lucide:arrow-right" className="text-lg" />
        </div>
      </div>
    </motion.button>
  );
}
