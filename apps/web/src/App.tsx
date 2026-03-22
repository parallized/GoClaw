import { useEffect, useMemo, useState } from "react";
import type { PhotoWeekRequest, PlanResult, RunPlanRequest, ScenarioId, ScenarioManifest } from "@goplan/contracts";
import { PlanResultView } from "./components/PlanResult";
import { FormSection } from "./components/FormSection";
import { ScenarioCard } from "./components/ScenarioCard";
import { fetchPlan, fetchScenarios } from "./lib/api";
import { defaultPhotoForm, defaultRunForm, defaultScenarioId } from "./lib/constants";

export function App() {
  const [scenarios, setScenarios] = useState<ScenarioManifest[]>([]);
  const [scenarioId, setScenarioId] = useState<ScenarioId>(defaultScenarioId);
  const [runForm, setRunForm] = useState<RunPlanRequest>(defaultRunForm);
  const [photoForm, setPhotoForm] = useState<PhotoWeekRequest>(defaultPhotoForm);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchScenarios()
      .then((data) => {
        setScenarios(data);
        const firstScenario = data[0];
        if (firstScenario) {
          setScenarioId((current) => data.some((item) => item.id === current) ? current : firstScenario.id);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "场景加载失败");
      });
  }, []);

  const activeScenario = useMemo(() => scenarios.find((item) => item.id === scenarioId) ?? null, [scenarios, scenarioId]);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const payload = scenarioId === "run_tomorrow" ? runForm : photoForm;
      const data = await fetchPlan(scenarioId, payload);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "规划生成失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.14),_transparent_32%),radial-gradient(circle_at_right,_rgba(217,70,239,0.12),_transparent_24%),linear-gradient(180deg,_#020617_0%,_#0f172a_45%,_#020617_100%)] text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
        <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200">
              AI 智能活动规划器 MVP
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white">GoPlan</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">
              用真实天气、真实 POI 和真实路径数据，为你生成跑步路线与最近一周拍照计划。
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
            当前场景：<span className="font-medium text-white">{activeScenario?.title ?? "加载中"}</span>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-2">
          {scenarios.map((scenario) => (
            <ScenarioCard key={scenario.id} scenario={scenario} active={scenario.id === scenarioId} onSelect={setScenarioId} />
          ))}
        </section>

        <div className="mt-8 grid gap-8 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-6">
            <FormSection
              scenarioId={scenarioId}
              runForm={runForm}
              photoForm={photoForm}
              onRunChange={setRunForm}
              onPhotoChange={setPhotoForm}
            />

            <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={loading}
                className="w-full rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "规划生成中..." : "生成完整规划"}
              </button>
              <div className="mt-3 text-xs text-slate-400">
                会调用 `/api/scenarios` 与 `/api/plans/:scenarioId`，结果直接按结构化 JSON 渲染。
              </div>
            </section>
          </div>

          <section className="space-y-4">
            {error ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-100">
                {error}
              </div>
            ) : null}
            <PlanResultView plan={result} />
          </section>
        </div>
      </div>
    </main>
  );
}
