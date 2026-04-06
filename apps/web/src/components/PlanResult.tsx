import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import type {
  PhotoSpot,
  PhotoWeekPlan,
  PlanExecutionStage,
  PlanExecutionStageStatus,
  PlanResult,
  RunRoute,
  RunPlan
} from "@goclaw/contracts";
import type { ReservationTarget } from "./NavigationStack";

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: "circOut" } as any,
};

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

type ResultActionHandler = (target?: ReservationTarget) => void;

function RunPlanView({
  plan,
  onReserve,
  onOpenNavigation
}: {
  plan: RunPlan;
  onReserve?: (plan: PlanResult) => void;
  onOpenNavigation?: ResultActionHandler;
}) {
  return (
    <motion.div className="space-y-12" {...fadeUp}>
      <header>
        <div className="result-badge animate-pulse mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse"></span> 最佳出发时间
        </div>
        <div className="text-6xl font-bold text-primary tracking-tight mb-6">{plan.bestTime}</div>
        <p className="text-secondary text-lg leading-relaxed max-w-2xl">{plan.reason}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <span className="bg-surface-gray text-secondary px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-widest">{plan.city}</span>
          <span className="bg-surface-gray text-secondary px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-widest">{plan.targetDate}</span>
          <span className="bg-surface-gray text-secondary px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-widest">{plan.weatherSummary}</span>
          <span className="bg-surface-gray text-secondary px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-widest">{plan.framedWindow.from}-{plan.framedWindow.to}</span>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => onReserve?.(plan)} className="result-nav-link">
            加入收藏 <Icon icon="lucide:bookmark-plus" className="text-sm" />
          </button>
          <button type="button" onClick={() => onOpenNavigation?.()} className="result-nav-link">
            内部导航 <Icon icon="lucide:map" className="text-sm" />
          </button>
        </div>
      </header>

      <section>
        <h3 className="mb-8 text-sm font-semibold uppercase tracking-widest text-primary flex items-center gap-2 opacity-80">
          <Icon icon="lucide:map" className="text-accent-blue" /> 路线推荐
        </h3>
        <div className="space-y-6">
          {plan.routes.map((route, idx) => (
            <motion.article
              key={route.name}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.06, ease: [0.19, 1, 0.22, 1] }}
              className="result-card p-6 group"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
                <div className="flex items-start gap-4">
                  <span className="result-index">{idx + 1}</span>
                  <div>
                    <span className="font-bold text-2xl text-primary block mb-3">{route.name}</span>
                    <div className="text-tertiary flex gap-6 text-sm font-bold uppercase tracking-widest">
                      <span className="flex items-center gap-1.5"><span>📏</span>{route.distanceKm} KM</span>
                      <span className="flex items-center gap-1.5"><span>⏱️</span>{route.estTimeMin} MIN</span>
                      <span>{route.recommendedTime}</span>
                      <span>{route.timeWindow.from}-{route.timeWindow.to}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className="result-nav-link" onClick={() => onOpenNavigation?.(toReservationTarget(route))}>
                    内部导航 <Icon icon="lucide:map" className="text-sm" />
                  </button>
                  <a className="result-nav-link" href={route.navigationUrl} target="_blank" rel="noreferrer">
                    外部导航 <Icon icon="lucide:arrow-up-right" className="text-sm" />
                  </a>
                </div>
              </div>

              <p className="text-secondary mt-6 text-base leading-relaxed opacity-80">{route.why}</p>

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
        <section className="bg-surface-gray/20 rounded-2xl p-6 ring-1 ring-white/5">
          <h3 className="mb-6 text-sm font-semibold uppercase tracking-widest text-primary flex items-center gap-2 opacity-80">
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
    </motion.div>
  );
}

function PhotoWeekView({
  plan,
  onReserve,
  onOpenNavigation
}: {
  plan: PhotoWeekPlan;
  onReserve?: (plan: PlanResult) => void;
  onOpenNavigation?: ResultActionHandler;
}) {
  return (
    <motion.div className="space-y-12" {...fadeUp}>
      <header>
        <div className="text-accent-pink text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent-pink"></span> 周度摄影计划
        </div>
        <div className="text-5xl font-bold text-primary tracking-tight mb-4">{plan.city}</div>
        <div className="text-tertiary text-sm font-bold uppercase tracking-widest">{plan.rangeLabel}</div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => onReserve?.(plan)} className="result-nav-link">
            加入收藏 <Icon icon="lucide:bookmark-plus" className="text-sm" />
          </button>
          <button type="button" onClick={() => onOpenNavigation?.()} className="result-nav-link">
            内部导航 <Icon icon="lucide:map" className="text-sm" />
          </button>
        </div>
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

                    <div className="flex flex-wrap items-center gap-3">
                      <button type="button" className="result-nav-link" onClick={() => onOpenNavigation?.(toReservationTarget(spot))}>
                        内部导航 <Icon icon="lucide:map" className="text-sm" />
                      </button>
                      <a className="result-nav-link" href={spot.navigationUrl} target="_blank" rel="noreferrer">
                        外部导航 <Icon icon="lucide:arrow-up-right" className="text-sm" />
                      </a>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </motion.section>
        ))}
      </div>

      {plan.tips && plan.tips.length > 0 && (
        <section className="bg-surface-gray rounded-md p-8 border border-edge">
          <h3 className="mb-6 text-sm font-semibold uppercase tracking-widest text-primary flex items-center gap-2 opacity-80">
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
    </motion.div>
  );
}

export function PlanResultView({
  plan,
  onReserve,
  onOpenNavigation
}: {
  plan: PlanResult;
  onReserve?: (plan: PlanResult) => void;
  onOpenNavigation?: ResultActionHandler;
}) {
  return (
    <div className="space-y-12">
      {plan.type === "run_tomorrow"
        ? <RunPlanView plan={plan} onReserve={onReserve} onOpenNavigation={onOpenNavigation} />
        : <PhotoWeekView plan={plan} onReserve={onReserve} onOpenNavigation={onOpenNavigation} />}
    </div>
  );
}

function toReservationTarget(item: RunRoute | PhotoSpot): ReservationTarget {
  return {
    name: item.name,
    source: "timeWindow" in item ? "run" : "photo"
  };
}
