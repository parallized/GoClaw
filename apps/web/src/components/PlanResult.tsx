import type { PhotoWeekPlan, PlanMeta, PlanResult, RunPlan } from "@goplan/contracts";

function formatOutcomeLabel(outcome: PlanMeta["process"][number]["outcome"]): string {
  switch (outcome) {
    case "fallback":
      return "已回退";
    case "skipped":
      return "已跳过";
    default:
      return "已完成";
  }
}

function ProcessView({ meta }: { meta: PlanMeta }) {
  return (
    <section className="border border-solid border-edge rounded-2 p-4 bg-surface">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <h3 className="text-sm font-semibold m-0">规划过程</h3>
        <div className="text-tertiary text-xs flex flex-wrap gap-2">
          <span>天气：{meta.weatherProvider}</span>
          <span>地点：{meta.poiProvider}</span>
          <span>路线：{meta.routingProvider}</span>
          <span>AI：{meta.aiEnhanced ? "已启用" : "未启用"}</span>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {meta.process.map((step, idx) => (
          <article key={`${step.title}-${idx}`} className="border border-solid border-edge rounded-2 p-4 bg-surface-hover">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">{idx + 1}. {step.title}</div>
                <p className="text-secondary mt-1.5 text-sm leading-relaxed mb-0">{step.detail}</p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-primary">{formatOutcomeLabel(step.outcome)}</div>
                {step.provider && <div className="text-xs text-tertiary mt-1">{step.provider}</div>}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function RunPlanView({ plan }: { plan: RunPlan }) {
  return (
    <div className="space-y-6">
      {/* Best time highlight */}
      <div className="border border-solid border-edge rounded-2 p-5 bg-surface-hover">
        <div className="text-accent-green text-xs font-medium uppercase tracking-wide">最佳出发时间</div>
        <div className="font-serif mt-2 text-3xl font-bold">{plan.bestTime}</div>
        <p className="text-secondary mt-2 text-sm leading-relaxed">{plan.reason}</p>
        <div className="text-tertiary mt-3 text-xs">
          {plan.city} · {plan.targetDate} · {plan.weatherSummary}
        </div>
      </div>

      {/* Routes */}
      <section>
        <h3 className="font-serif mb-4 text-lg font-semibold">推荐路线</h3>
        <div className="space-y-3">
          {plan.routes.map((route, idx) => (
            <article key={route.name} className="border border-solid border-edge rounded-2 p-4 bg-surface">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-6 h-6 shrink-0 rounded-1.5 text-xs font-medium text-white bg-primary">{idx + 1}</span>
                  <span className="font-medium">{route.name}</span>
                </div>
                <div className="text-tertiary flex gap-3 text-xs">
                  <span>{route.distanceKm} km</span>
                  <span>{route.estTimeMin} 分钟</span>
                </div>
              </div>

              <p className="text-secondary mt-2.5 text-sm leading-relaxed">{route.why}</p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {route.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center rounded-1.5 py-0.5 px-2 text-xs leading-4 bg-[var(--notion-tag-gray-bg)] text-[var(--notion-tag-gray-text)]">{tag}</span>
                ))}
                <a className="text-xs font-medium text-accent-blue no-underline ml-auto transition-opacity hover:opacity-75" href={route.navigationUrl} target="_blank" rel="noreferrer">
                  打开导航 →
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Tips */}
      <div className="border border-solid border-edge rounded-2 p-4 bg-surface">
        <h3 className="mb-3 text-sm font-semibold">注意事项</h3>
        <ul className="list-none m-0 p-0 flex flex-col gap-1.5 text-sm text-secondary">
          {plan.tips.map((tip) => (
            <li key={tip} className="flex gap-2"><span className="text-tertiary">·</span>{tip}</li>
          ))}
        </ul>
      </div>

      <ProcessView meta={plan.meta} />
    </div>
  );
}

function PhotoWeekView({ plan }: { plan: PhotoWeekPlan }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-solid border-edge rounded-2 p-5 bg-surface-hover">
        <div className="text-accent-pink text-xs font-medium uppercase tracking-wide">拍照周计划</div>
        <div className="font-serif mt-2 text-3xl font-bold">{plan.city}</div>
        <p className="text-secondary mt-2 text-sm">{plan.rangeLabel}</p>
      </div>

      {/* Days */}
      <div className="space-y-5">
        {plan.days.map((day) => (
          <section key={day.date} className="border border-solid border-edge rounded-2 p-5 bg-surface">
            <header className="mb-4">
              <h3 className="font-serif text-lg font-semibold">{day.date}</h3>
              <div className="text-secondary mt-1 text-sm">{day.weather}</div>
            </header>

            <div className="grid gap-4 lg:grid-cols-2">
              {day.spots.map((spot) => (
                <article key={`${day.date}-${spot.name}`} className="border border-solid border-edge rounded-2 p-4 bg-surface-hover">
                  <div className="font-medium">{spot.name}</div>
                  <p className="text-secondary mt-1.5 text-sm leading-relaxed">{spot.reason}</p>

                  <div className="mt-3 space-y-1">
                    <div className="text-sm text-secondary"><span className="text-tertiary mr-2">时间</span>{spot.bestTime}</div>
                    <div className="text-sm text-secondary"><span className="text-tertiary mr-2">拍法</span>{spot.way}</div>
                    <div className="text-sm text-secondary"><span className="text-tertiary mr-2">参数</span>{spot.cameraSummary}</div>
                    <div className="text-sm text-secondary"><span className="text-tertiary mr-2">提示</span>{spot.tip}</div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {spot.categories.map((cat) => (
                      <span key={cat} className="inline-flex items-center rounded-1.5 py-0.5 px-2 text-xs leading-4 bg-[var(--notion-tag-pink-bg)] text-[var(--notion-tag-pink-text)]">{cat}</span>
                    ))}
                    <a className="text-xs font-medium text-accent-blue no-underline ml-auto transition-opacity hover:opacity-75" href={spot.navigationUrl} target="_blank" rel="noreferrer">
                      打开导航 →
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Global tips */}
      <div className="border border-solid border-edge rounded-2 p-4 bg-surface">
        <h3 className="mb-3 text-sm font-semibold">全局建议</h3>
        <ul className="list-none m-0 p-0 flex flex-col gap-1.5 text-sm text-secondary">
          {plan.tips.map((tip) => (
            <li key={tip} className="flex gap-2"><span className="text-tertiary">·</span>{tip}</li>
          ))}
        </ul>
      </div>

      <ProcessView meta={plan.meta} />
    </div>
  );
}

export function PlanResultView({ plan }: { plan: PlanResult | null }) {
  if (!plan) {
    return (
      <div className="border border-dashed border-edge rounded-2 p-10 text-center text-sm text-tertiary">
        选择场景并提交参数后，这里会展示规划结果。
      </div>
    );
  }

  return plan.type === "run_tomorrow" ? <RunPlanView plan={plan} /> : <PhotoWeekView plan={plan} />;
}
