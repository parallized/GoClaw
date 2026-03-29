import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import type { ScenarioId, ScenarioManifest } from "@goclaw/contracts";
import { ScenarioCard } from "./ScenarioCard";

interface ScenarioStepProps {
  scenarios: ScenarioManifest[];
  onSelect: (id: ScenarioId) => void;
}

export function ScenarioStep({ scenarios, onSelect }: ScenarioStepProps) {
  return (
    <motion.div
      className="flex flex-col h-full"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.19, 1, 0.22, 1] }}
    >
      <header className="mb-4 pt-12">
        <h1 className="text-4xl sm:text-5xl font-semibold leading-tight tracking-tight mb-4 flex items-center gap-4">
          <span className="bg-gradient-to-br from-accent-indigo to-accent-blue bg-clip-text text-transparent">GoClaw</span>
        </h1>
        <p className="text-secondary text-[16px] leading-relaxed font-medium">
          让 AI 告诉你今天该去哪玩
        </p>
      </header>
      <section aria-label="场景选择" className="flex-1">
        <div className="grid gap-4 sm:grid-cols-2">
          {scenarios.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08, ease: [0.19, 1, 0.22, 1] }}
            >
              <ScenarioCard
                scenario={s}
                onSelect={onSelect}
              />
            </motion.div>
          ))}
        </div>
      </section>
    </motion.div>
  );
}
