import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import type { ScenarioId, ScenarioManifest } from "@goclaw/contracts";

interface ScenarioCardProps {
  scenario: ScenarioManifest;
  onSelect: (scenarioId: ScenarioId) => void;
}

export function ScenarioCard({ scenario, onSelect }: ScenarioCardProps) {
  return (
    <motion.button
      type="button"
      onClick={() => onSelect(scenario.id)}
      className="n-glass-card n-scenario-card p-8 flex flex-col h-full w-full text-left relative overflow-hidden group"
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

      <div className="flex flex-col items-start w-full relative z-10">
        <h3 className="text-xl font-semibold text-primary tracking-tight">
          {scenario.title}
        </h3>
        <p className="text-secondary text-[13px] leading-relaxed max-w-[95%] font-medium">
          {scenario.description}
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 relative z-10">
        {scenario.capabilities.map((cap) => (
          <span
            key={cap}
            className="inline-flex items-center gap-1 rounded-md py-1 px-2.5 text-[12px] font-medium text-primary transition-none lowercase opacity-80"
            style={{ backgroundColor: 'var(--color-surface-gray)' }}
          >
            {cap}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between w-full mt-auto relative z-10">
        <div className="text-[13px] font-medium flex items-center gap-2 uppercase tracking-widest" style={{ color: 'var(--color-accent-indigo)' }}>
          {scenario.cta}
          <Icon icon="lucide:arrow-right" className="text-lg" />
        </div>
      </div>
    </motion.button>
  );
}
