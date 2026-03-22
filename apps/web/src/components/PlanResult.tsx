import type { PhotoWeekPlan, PlanResult, RunPlan } from "@goplan/contracts";

function RunPlanView({ plan }: { plan: RunPlan }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/8 p-4">
        <div className="text-sm text-emerald-200">最佳出发时间</div>
        <div className="mt-1 text-2xl font-semibold text-white">{plan.bestTime}</div>
        <div className="mt-2 text-sm text-slate-200">{plan.reason}</div>
        <div className="mt-2 text-xs text-slate-400">{plan.city} · {plan.targetDate} · {plan.weatherSummary}</div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {plan.routes.map((route) => (
          <article key={route.name} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-base font-semibold text-white">{route.name}</div>
            <div className="mt-2 flex gap-2 text-xs text-slate-300">
              <span>{route.distanceKm} km</span>
              <span>{route.estTimeMin} 分钟</span>
            </div>
            <div className="mt-3 text-sm text-slate-200">{route.why}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {route.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-white/6 px-2 py-1 text-xs text-slate-300">{tag}</span>
              ))}
            </div>
            <a className="mt-4 inline-flex text-sm text-cyan-300 hover:text-cyan-200" href={route.navigationUrl} target="_blank" rel="noreferrer">
              打开导航
            </a>
          </article>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm font-medium text-white">注意事项</div>
        <ul className="mt-3 space-y-2 text-sm text-slate-200">
          {plan.tips.map((tip) => (
            <li key={tip}>- {tip}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PhotoWeekView({ plan }: { plan: PhotoWeekPlan }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/8 p-4">
        <div className="text-sm text-fuchsia-200">拍照周计划</div>
        <div className="mt-1 text-2xl font-semibold text-white">{plan.city}</div>
        <div className="mt-2 text-sm text-slate-200">{plan.rangeLabel}</div>
      </div>

      <div className="space-y-4">
        {plan.days.map((day) => (
          <section key={day.date} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-lg font-semibold text-white">{day.date}</div>
                <div className="text-sm text-slate-300">{day.weather}</div>
              </div>
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {day.spots.map((spot) => (
                <article key={`${day.date}-${spot.name}`} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="text-base font-semibold text-white">{spot.name}</div>
                  <div className="mt-2 text-sm text-slate-200">{spot.reason}</div>
                  <div className="mt-3 text-sm text-slate-300">最佳时段：{spot.bestTime}</div>
                  <div className="mt-2 text-sm text-slate-300">拍法：{spot.way}</div>
                  <div className="mt-2 text-sm text-slate-300">参数：{spot.cameraSummary}</div>
                  <div className="mt-2 text-sm text-slate-300">提示：{spot.tip}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {spot.categories.map((item) => (
                      <span key={item} className="rounded-full bg-white/6 px-2 py-1 text-xs text-slate-300">{item}</span>
                    ))}
                  </div>
                  <a className="mt-4 inline-flex text-sm text-cyan-300 hover:text-cyan-200" href={spot.navigationUrl} target="_blank" rel="noreferrer">
                    打开导航
                  </a>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm font-medium text-white">全局建议</div>
        <ul className="mt-3 space-y-2 text-sm text-slate-200">
          {plan.tips.map((tip) => (
            <li key={tip}>- {tip}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function PlanResultView({ plan }: { plan: PlanResult | null }) {
  if (!plan) {
    return (
      <div className="rounded-3xl border border-dashed border-white/10 bg-white/3 p-8 text-center text-slate-400">
        选择场景并提交参数后，这里会展示结构化规划结果。
      </div>
    );
  }

  return plan.type === "run_tomorrow" ? <RunPlanView plan={plan} /> : <PhotoWeekView plan={plan} />;
}

