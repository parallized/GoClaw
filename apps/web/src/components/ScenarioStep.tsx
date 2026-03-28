import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import type { ScenarioId, ScenarioManifest } from "@goclaw/contracts";
import { ScenarioCard } from "./ScenarioCard";

interface ScenarioStepProps {
  scenarios: ScenarioManifest[];
  scenarioId: ScenarioId;
  onSelect: (id: ScenarioId) => void;
}

export function ScenarioStep({ scenarios, scenarioId, onSelect }: ScenarioStepProps) {
  return (
    <motion.div
      className="flex flex-col h-full"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.19, 1, 0.22, 1] }}
    >
      <header className="mb-16">
        <h1 className="text-5xl sm:text-6xl font-bold leading-tight tracking-tight mb-4 flex items-center gap-4">
          <span className="bg-gradient-to-br from-accent-indigo to-accent-blue bg-clip-text text-transparent">GoClaw</span>
          <span className="text-tertiary font-normal text-2xl sm:text-3xl opacity-40">/ 推演</span>
        </h1>
        <p className="text-secondary text-lg sm:text-xl leading-relaxed max-w-2xl font-medium">
          灵感推演工具。基于实时气象、地理空间与光影模型，为您的下一次探索提供优雅的预案。
        </p>
      </header>
      <section aria-label="场景选择" className="flex-1">
        <h2 className="mb-10 text-xs font-bold tracking-[0.3em] text-tertiary uppercase flex items-center gap-4">
          开启推演 <div className="h-px flex-1 bg-white/5"></div>
        </h2>
        <div className="grid gap-6 sm:grid-cols-2" role="listbox" aria-label="场景列表">
          {scenarios.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08, ease: [0.19, 1, 0.22, 1] }}
            >
              <ScenarioCard
                scenario={s}
                active={s.id === scenarioId}
                onSelect={onSelect}
              />
            </motion.div>
          ))}
        </div>
      </section>
    </motion.div>
  );
}
