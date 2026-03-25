import type {
  PhotoWeekPlan,
  PlanExecutionLogEntry,
  PlanExecutionStage,
  PlanExecutionStageStatus,
  PlanMeta,
  PlanResult,
  RunPlan
} from "@goclaw/contracts";

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

function formatLogLevelLabel(level: PlanExecutionLogEntry["level"]): string {
  switch (level) {
    case "warn":
      return "提示";
    case "error":
      return "错误";
    default:
      return "日志";
  }
}

function ProcessView({ meta }: { meta: PlanMeta }) {
  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-center gap-4 justify-between mb-8">
        <h3 className="text-sm font-bold m-0 text-primary flex items-center gap-2 uppercase tracking-widest">
          <span>🧠</span> 演算逻辑
        </h3>
        <div className="text-tertiary text-[10px] font-bold uppercase tracking-widest flex flex-wrap gap-3">
          <span>天气: {meta.weatherProvider}</span>
          <span>地点: {meta.poiProvider}</span>
          <span>路线: {meta.routingProvider}</span>
          {meta.aiEnhanced && <span className="text-accent-blue">AI 深度增强</span>}
        </div>
      </div>

      <div className="space-y-6">
        {meta.process.map((step, idx) => (
          <article key={`${step.title}-${idx}`} className="flex items-start gap-5">
            <div className="w-6 h-6 rounded-full bg-surface-gray flex items-center justify-center shrink-0 font-bold text-tertiary text-[10px] border border-solid border-edge">
              {idx + 1}
            </div>
            <div className="flex-1 pb-6 border-none">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <div className="font-bold text-primary">{step.title}</div>
                <div className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest ${step.outcome === "success" ? "text-accent-green bg-accent-green/10" : "text-accent-orange bg-accent-orange/10"}`}>
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

function ExecutionPanel({
  stages,
  stageStatuses,
  logs,
  loading
}: {
  stages: PlanExecutionStage[];
  stageStatuses: Record<string, PlanExecutionStageStatus>;
  logs: PlanExecutionLogEntry[];
  loading: boolean;
}) {
  if (!loading && stages.length === 0 && logs.length === 0) {
    return null;
  }

  return (
    <section className="mb-12">
      <div className="flex flex-wrap items-center gap-4 justify-between mb-8">
        <h3 className="text-sm font-bold m-0 text-primary flex items-center gap-2 uppercase tracking-widest">
          <span>📡</span> 实时监控
        </h3>
        <div className="text-tertiary text-[10px] font-bold uppercase tracking-widest">
          {loading ? "实时连接中…" : "任务已结束"}
        </div>
      </div>

      <div className="space-y-4">
        {stages.map((stage) => {
          const stageLogs = logs.filter((entry) => entry.stageId === stage.id);
          const status = stageStatuses[stage.id] ?? "pending";
          return (
            <article key={stage.id} className={`rounded-md p-5 border border-solid transition-colors ${status === "running" ? "border-accent-blue bg-accent-blue/5" : "border-edge bg-surface-gray"}`}>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-primary">{stage.order + 1}. {stage.title}</div>
                  {stage.detail && <p className="text-secondary text-sm leading-relaxed mt-2 mb-0">{stage.detail}</p>}
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-[10px] font-bold uppercase tracking-widest ${status === "running" ? "text-accent-blue" : (status === "completed" ? "text-accent-green" : "text-tertiary")}`}>{formatStageStatusLabel(status)}</div>
                </div>
              </div>

              <div className="space-y-2 mt-4">
                {stageLogs.map((entry, idx) => (
                  <div key={`${entry.timestamp}-${idx}`} className="text-xs">
                    <div className="flex items-center gap-2 text-tertiary font-bold uppercase tracking-widest text-[9px]">
                      <span>{formatLogLevelLabel(entry.level)}</span>
                      <span>·</span>
                      <span>{new Date(entry.timestamp).toLocaleTimeString("zh-CN", { hour12: false })}</span>
                    </div>
                    <div className="mt-1 text-secondary leading-relaxed">{entry.message}</div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function RunPlanView({ plan }: { plan: RunPlan }) {
  return (
    <div className="space-y-12 animate-fade-in">
      <header>
        <div className="text-accent-green text-[10px] font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-green"></span> 最佳出发时间
        </div>
        <div className="text-5xl font-bold text-primary tracking-tight mb-6">{plan.bestTime}</div>
        <p className="text-secondary text-lg leading-relaxed max-w-2xl">{plan.reason}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <span className="bg-surface-gray text-secondary px-3 py-1.5 rounded text-xs font-bold uppercase tracking-widest border border-solid border-edge">{plan.city}</span>
          <span className="bg-surface-gray text-secondary px-3 py-1.5 rounded text-xs font-bold uppercase tracking-widest border border-solid border-edge">{plan.targetDate}</span>
          <span className="bg-surface-gray text-secondary px-3 py-1.5 rounded text-xs font-bold uppercase tracking-widest border border-solid border-edge">{plan.weatherSummary}</span>
        </div>
      </header>

      <section>
        <h3 className="mb-8 text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2">
          <span>🗺️</span> 路线推荐
        </h3>
        <div className="space-y-6">
          {plan.routes.map((route, idx) => (
            <article key={route.name} className="n-glass-card p-6 group border-edge border-solid">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
                <div className="flex items-start gap-4">
                  <span className="flex items-center justify-center w-6 h-6 shrink-0 rounded bg-primary text-[10px] font-bold text-white border-none">{idx + 1}</span>
                  <div>
                    <span className="font-bold text-xl text-primary block mb-2">{route.name}</span>
                    <div className="text-tertiary flex gap-6 text-[10px] font-bold uppercase tracking-widest">
                      <span className="flex items-center gap-1.5"><span>📏</span>{route.distanceKm} KM</span>
                      <span className="flex items-center gap-1.5"><span>⏱️</span>{route.estTimeMin} MIN</span>
                    </div>
                  </div>
                </div>
                <a className="text-[10px] font-bold text-accent-blue no-underline transition-all hover:bg-accent-blue/10 bg-accent-blue/5 px-3 py-2 rounded uppercase tracking-widest border border-solid border-accent-blue/20" href={route.navigationUrl} target="_blank" rel="noreferrer">
                  立即导航 ↗
                </a>
              </div>

              <p className="text-secondary mt-5 text-sm leading-relaxed">{route.why}</p>

              <div className="mt-6 flex flex-wrap items-center gap-2">
                {route.tags.map((tag) => (
                  <span key={tag} className="text-[9px] font-bold uppercase tracking-widest bg-surface-gray text-tertiary px-2 py-0.5 rounded border border-solid border-edge">{tag}</span>
                ))}
                <span className="text-[9px] font-bold uppercase tracking-widest bg-accent-blue/10 text-accent-blue px-2 py-0.5 rounded">来源: {route.routeSource}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-surface-gray rounded-md p-8 border border-solid border-edge">
        <h3 className="mb-6 text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2">
          <span>💡</span> 贴心建议
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

      <ProcessView meta={plan.meta} />
    </div>
  );
}

function PhotoWeekView({ plan }: { plan: PhotoWeekPlan }) {
  return (
    <div className="space-y-12 animate-fade-in">
      <header>
        <div className="text-accent-pink text-[10px] font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-pink"></span> 周度摄影计划
        </div>
        <div className="text-5xl font-bold text-primary tracking-tight mb-4">{plan.city}</div>
        <div className="text-tertiary text-xs font-bold uppercase tracking-widest">{plan.rangeLabel}</div>
      </header>

      <div className="space-y-16">
        {plan.days.map((day) => (
          <section key={day.date} className="relative">
            <header className="mb-8 border-b border-solid border-edge pb-4 flex items-baseline justify-between">
              <h3 className="text-xl font-bold text-primary">{day.date}</h3>
              <div className="text-accent-pink font-bold text-xs uppercase tracking-widest">{day.weather}</div>
            </header>

            <div className="grid gap-8">
              {day.spots.map((spot) => (
                <article key={`${day.date}-${spot.name}`} className="group flex flex-col sm:flex-row gap-8 pb-8 border-b border-dashed border-edge last:border-none last:pb-0">
                  <div className="sm:w-1/3">
                    <div className="font-bold text-lg text-primary mb-3 group-hover:text-accent-pink transition-colors">{spot.name}</div>
                    <p className="text-secondary text-sm leading-relaxed">{spot.reason}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {spot.categories.map((cat) => (
                        <span key={cat} className="text-[9px] font-bold uppercase tracking-widest bg-accent-pink/10 text-accent-pink px-2 py-0.5 rounded">{cat}</span>
                      ))}
                    </div>
                  </div>

                  <div className="sm:w-2/3 flex flex-col gap-6">
                    <div className="grid grid-cols-2 gap-4 bg-surface-gray p-5 rounded-md border border-solid border-edge">
                      <div className="space-y-1">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-tertiary">最佳时间</div>
                        <div className="font-bold text-sm text-primary">{spot.bestTime}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-tertiary">建议拍法</div>
                        <div className="text-sm text-secondary">{spot.way}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-tertiary">参数参考</div>
                        <div className="text-xs text-secondary font-mono">{spot.cameraSummary}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-tertiary">拍摄贴士</div>
                        <div className="text-xs text-secondary italic">{spot.tip}</div>
                      </div>
                    </div>

                    <a className="self-start text-[10px] font-bold text-accent-pink no-underline transition-all hover:bg-accent-pink/10 bg-accent-pink/5 px-3 py-2 rounded uppercase tracking-widest border border-solid border-accent-pink/20" href={spot.navigationUrl} target="_blank" rel="noreferrer">
                      查看路线 ↗
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="bg-surface-gray rounded-md p-8 border border-solid border-edge">
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

      <ProcessView meta={plan.meta} />
    </div>
  );
}

export function PlanResultView({
  plan,
  stages = [],
  stageStatuses = {},
  logs = [],
  loading = false
}: {
  plan: PlanResult | null;
  stages?: PlanExecutionStage[];
  stageStatuses?: Record<string, PlanExecutionStageStatus>;
  logs?: PlanExecutionLogEntry[];
  loading?: boolean;
}) {
  if (!plan) {
    return (
      <div className="space-y-12">
        <ExecutionPanel stages={stages} stageStatuses={stageStatuses} logs={logs} loading={loading} />
        {!loading && stages.length === 0 && logs.length === 0 && (
          <div className="h-[600px] flex flex-col items-center justify-center p-12 text-center rounded-2xl bg-surface/5 border border-solid border-white/5 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.1)] transition-all hover:bg-surface/10">
            <div className="text-6xl mb-8 opacity-70 animate-pulse drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">✨</div>
            <div className="text-sm font-bold text-primary uppercase tracking-widest mb-3 tracking-[0.2em]">选择场景并生成规划</div>
            <div className="text-[10px] text-tertiary tracking-[0.1em] uppercase font-bold">此区域将展示你的专属内容</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <ExecutionPanel stages={stages} stageStatuses={stageStatuses} logs={logs} loading={loading} />
      {plan.type === "run_tomorrow" ? <RunPlanView plan={plan} /> : <PhotoWeekView plan={plan} />}
    </div>
  );
}
