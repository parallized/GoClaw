import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import type {
  PhotoWeekPlan,
  PlanExecutionStage,
  PlanExecutionStageStatus,
  PlanMeta,
  PlanResult,
  RunPlan
} from "@goclaw/contracts";

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: "circOut" } as any,
};

function formatOutcomeLabel(outcome: PlanMeta["process"][number]["outcome"]): string {
  switch (outcome) {
    case "fallback":
      return "已回退自动规划";
    case "skipped":
      return "无缝跳过";
    default:
      return "精细规划完成";
  }
}

function formatStageStatusLabel(status: PlanExecutionStageStatus): string {
  switch (status) {
    case "running":
      return "进行中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "skipped":
      return "已跳过";
    default:
      return "等待中";
  }
}

function ProcessView({ meta }: { meta: PlanMeta }) {
  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-center gap-4 justify-between mb-8">
        <h3 className="text-sm font-bold m-0 text-primary flex items-center gap-2 uppercase tracking-widest">
          <span>🧠</span> 演算逻辑
        </h3>
        <div className="text-tertiary text-sm font-bold uppercase tracking-widest flex flex-wrap gap-3">
          <span>天气: {meta.weatherProvider}</span>
          <span>地点: {meta.poiProvider}</span>
          <span>路线: {meta.routingProvider}</span>
          {meta.aiEnhanced && <span className="text-accent-blue">AI 深度增强</span>}
        </div>
      </div>

      <div className="space-y-6">
        {meta.process.map((step, idx) => (
          <article key={`${step.title}-${idx}`} className="flex items-start gap-5">
            <div className="w-8 h-8 rounded-full bg-surface-gray flex items-center justify-center shrink-0 font-bold text-tertiary text-sm border-none">
              {idx + 1}
            </div>
            <div className="flex-1 pb-6 border-none">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <div className="font-bold text-primary">{step.title}</div>
                <div className={`text-sm font-bold px-3 py-1 rounded uppercase tracking-widest ${step.outcome === "success" ? "bg-tag-green-bg text-tag-green-text" : "bg-tag-orange-bg text-tag-orange-text"}`}>
                  {formatOutcomeLabel(step.outcome)}
                </div>
              </div>
              <p className="text-secondary text-sm leading-relaxed mb-0">{step.detail}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ExecutionPanel({
  stages,
  stageStatuses,
  loading
}: {
  stages: PlanExecutionStage[];
  stageStatuses: Record<string, PlanExecutionStageStatus>;
  loading: boolean;
}) {
  if (!loading && stages.length === 0) {
    return null;
  }

  return (
    <section className="mb-12">
      <div className="flex flex-wrap items-center gap-4 justify-between mb-8">
        <h3 className="text-sm font-bold m-0 text-primary flex items-center gap-2 uppercase tracking-widest">
          <Icon icon="lucide:loader-2" className={`${loading ? "animate-spin" : ""} text-accent-blue`} /> 执行状态
        </h3>
        <div className="text-tertiary text-[11px] font-bold uppercase tracking-widest bg-surface-gray px-3 py-1 rounded-full border border-edge">
          {loading ? "实时连接中…" : "演算任务已结束"}
        </div>
      </div>

      <div className="relative space-y-1">
        {/* Timeline Line */}
        <div className="execution-timeline-line"></div>

        {stages.map((stage, i) => {
          const status = stageStatuses[stage.id] ?? "pending";
          const isActive = status === "running";
          const isCompleted = status === "completed";
          const isFailed = status === "failed";

          return (
            <motion.article
              key={stage.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className={`execution-item z-10 flex items-start gap-4 p-3 ${
                isActive ? "execution-item--active" : isCompleted ? "execution-item--completed" : ""
              }`}
            >
              <div className="flex flex-col items-center shrink-0 mt-0.5">
                <div className="execution-dot">
                  {isActive ? (
                    <Icon icon="svg-spinners:ring-resize" className="text-base" />
                  ) : isCompleted ? (
                    <Icon icon="lucide:check-circle-2" className="text-base" />
                  ) : isFailed ? (
                    <Icon icon="lucide:alert-circle" className="text-base" />
                  ) : (
                    <span className="text-[11px] font-medium opacity-50">{stage.order + 1}</span>
                  )}
                </div>
              </div>

              <div className="flex-1">
                <div className="flex items-center justify-between gap-4 mb-0.5">
                  <h4 className={`font-semibold text-[14px] transition-colors ${isActive ? "text-primary" : "text-secondary"}`}>
                    {stage.title}
                  </h4>
                  <div className="execution-badge">
                    {formatStageStatusLabel(status)}
                  </div>
                </div>
                {stage.detail && (
                  <p className="text-[13px] text-tertiary leading-relaxed">
                    {stage.detail}
                  </p>
                )}
              </div>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}

function RunPlanView({ plan }: { plan: RunPlan }) {
  return (
    <motion.div className="space-y-12" {...fadeUp}>
      <header>
        <div className="text-accent-green text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent-green"></span> 最佳出发时间
        </div>
        <div className="text-5xl font-bold text-primary tracking-tight mb-6">{plan.bestTime}</div>
        <p className="text-secondary text-lg leading-relaxed max-w-2xl">{plan.reason}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <span className="bg-surface-gray text-secondary px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-widest">{plan.city}</span>
          <span className="bg-surface-gray text-secondary px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-widest">{plan.targetDate}</span>
          <span className="bg-surface-gray text-secondary px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-widest">{plan.weatherSummary}</span>
        </div>
      </header>

      <section>
        <h3 className="mb-8 text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2">
          <span>🗺️</span> 路线推荐
        </h3>
        <div className="space-y-6">
          {plan.routes.map((route, idx) => (
            <motion.article
              key={route.name}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.06, ease: [0.19, 1, 0.22, 1] }}
              className="bg-surface-gray p-8 rounded-2xl group"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
                <div className="flex items-start gap-4">
                  <span className="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-primary text-sm font-bold text-white border-none">{idx + 1}</span>
                  <div>
                    <span className="font-bold text-2xl text-primary block mb-3">{route.name}</span>
                    <div className="text-tertiary flex gap-6 text-sm font-bold uppercase tracking-widest">
                      <span className="flex items-center gap-1.5"><span>📏</span>{route.distanceKm} KM</span>
                      <span className="flex items-center gap-1.5"><span>⏱️</span>{route.estTimeMin} MIN</span>
                    </div>
                  </div>
                </div>
                <a className="text-sm font-bold bg-tag-blue-bg text-tag-blue-text no-underline transition-all hover:bg-accent-blue hover:text-white px-4 py-2.5 rounded-lg uppercase tracking-widest flex items-center" href={route.navigationUrl} target="_blank" rel="noreferrer">
                  立即导航 ↗
                </a>
              </div>

              <p className="text-secondary mt-6 text-base leading-relaxed">{route.why}</p>

              {(route as any).highlights && (route as any).highlights.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {(route as any).highlights.map((h: string) => (
                    <span key={h} className="map-tag map-tag--sage">{h}</span>
                  ))}
                </div>
              )}
            </motion.article>
          ))}
        </div>
      </section>

      {plan.tips && plan.tips.length > 0 && (
        <section className="bg-surface-gray rounded-md p-8 border border-edge">
          <h3 className="mb-6 text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2">
            <span>💡</span> 跑步贴士
          </h3>
          <ul className="list-none m-0 p-0 space-y-4">
            {plan.tips.map((tip) => (
              <li key={tip} className="flex gap-4 items-start text-secondary text-sm">
                <span className="text-accent-green font-bold shrink-0">·</span>
                <span className="leading-relaxed">{tip}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ProcessView meta={plan.meta} />
    </motion.div>
  );
}

function PhotoWeekView({ plan }: { plan: PhotoWeekPlan }) {
  return (
    <motion.div className="space-y-12" {...fadeUp}>
      <header>
        <div className="text-accent-pink text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent-pink"></span> 周度摄影计划
        </div>
        <div className="text-5xl font-bold text-primary tracking-tight mb-4">{plan.city}</div>
        <div className="text-tertiary text-sm font-bold uppercase tracking-widest">{plan.rangeLabel}</div>
      </header>

      <div className="space-y-16">
        {plan.days.map((day, dayIdx) => (
          <motion.section
            key={day.date}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: dayIdx * 0.07, ease: [0.19, 1, 0.22, 1] }}
            className="relative"
          >
            <header className="mb-10 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
              <h3 className="text-3xl font-bold text-primary">{day.date}</h3>
              <div className="text-accent-pink font-bold text-sm uppercase tracking-widest">{day.weather}</div>
            </header>

            <div className="grid gap-10">
              {day.spots.map((spot) => (
                <article key={`${day.date}-${spot.name}`} className="group flex flex-col sm:flex-row gap-10 pb-10 border-b border-white/5 last:border-none last:pb-0">
                  <div className="sm:w-1/3">
                    <div className="font-bold text-2xl text-primary mb-4 group-hover:text-accent-pink transition-colors">{spot.name}</div>
                    <p className="text-secondary text-base leading-relaxed">{spot.reason}</p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      {spot.categories.map((cat) => (
                        <span key={cat} className="map-tag map-tag--pink">{cat}</span>
                      ))}
                    </div>
                  </div>

                  <div className="sm:w-2/3 flex flex-col gap-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-surface-gray p-8 rounded-2xl">
                      <div className="space-y-2">
                        <div className="text-sm font-bold uppercase tracking-widest text-tertiary">最佳时间</div>
                        <div className="font-bold text-base text-primary">{spot.bestTime}</div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-sm font-bold uppercase tracking-widest text-tertiary">建议拍法</div>
                        <div className="text-base text-secondary">{spot.way}</div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-sm font-bold uppercase tracking-widest text-tertiary">参数参考</div>
                        <div className="text-sm text-secondary">{spot.cameraSummary}</div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-sm font-bold uppercase tracking-widest text-tertiary">拍摄贴士</div>
                        <div className="text-sm text-secondary italic">{spot.tip}</div>
                      </div>
                    </div>

                    <a className="text-sm font-bold bg-tag-pink-bg text-tag-pink-text no-underline transition-all hover:bg-accent-pink hover:text-white px-5 py-3 rounded-lg uppercase tracking-widest flex items-center" href={spot.navigationUrl} target="_blank" rel="noreferrer">
                      查看路线 ↗
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </motion.section>
        ))}
      </div>

      {plan.tips && plan.tips.length > 0 && (
        <section className="bg-surface-gray rounded-md p-8 border border-edge">
          <h3 className="mb-6 text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2">
            <span>📸</span> 全局贴士
          </h3>
          <ul className="list-none m-0 p-0 space-y-4">
            {plan.tips.map((tip) => (
              <li key={tip} className="flex gap-4 items-start text-secondary text-sm">
                <span className="text-accent-pink font-bold shrink-0">✨</span>
                <span className="leading-relaxed">{tip}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ProcessView meta={plan.meta} />
    </motion.div>
  );
}

export function PlanResultView({
  plan
}: {
  plan: PlanResult;
}) {
  return (
    <div className="space-y-12">
      {plan.type === "run_tomorrow" ? <RunPlanView plan={plan} /> : <PhotoWeekView plan={plan} />}
    </div>
  );
}
