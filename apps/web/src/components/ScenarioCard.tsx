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
      className="relative bg-surface-gray backdrop-blur-xl border border-edge rounded-2xl overflow-hidden cursor-pointer shadow-xl p-8 flex flex-col h-64 w-full text-left group transition-colors duration-200 ring-1 ring-white/5 hover:ring-white/20"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={{
        type: "spring",
        stiffness: 800,
        damping: 35,
        mass: 0.5
      }}
    >
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-white/[0.05] via-transparent to-transparent opacity-80 z-0"></div>

      <div className="absolute top-0 right-0 p-6 z-0 transition-all duration-500 group-hover:scale-110 group-hover:rotate-6">
        <Icon 
          icon={scenario.id === "run_tomorrow" ? "lucide:wind" : "lucide:camera"} 
          className="text-7xl text-accent-indigo opacity-[0.08] dark:opacity-[0.12] group-hover:opacity-[0.2]" 
        />
      </div>

      <div className="flex flex-col items-start w-full relative z-10 mb-5">
        <h3 className="text-2xl font-bold text-primary tracking-tight mb-2 group-hover:text-accent-indigo transition-colors duration-300">
          {scenario.title}
        </h3>
        <p className="text-secondary text-[14px] leading-relaxed max-w-[95%] font-medium opacity-80 group-hover:opacity-100 transition-opacity">
          {scenario.description}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 relative z-10 mb-8">
        {scenario.capabilities.map((cap) => (
          <span
            key={cap}
            className="inline-flex items-center rounded-md bg-white/[0.03] border border-white/5 py-1 px-2.5 text-[11px] font-semibold text-tertiary transition-all hover:bg-white/[0.08] hover:text-primary lowercase"
          >
            {cap}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between w-full mt-auto pt-4 relative z-10 transition-transform duration-300 group-hover:translate-x-1">
        <div className="text-[12px] font-bold flex items-center gap-2 uppercase tracking-widest text-accent-indigo">
          {scenario.cta}
          <Icon icon="lucide:arrow-right" className="text-lg transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </motion.button>
  );
}
