import { useEffect, useMemo, useRef, useState } from "react";
import type { PhotoWeekRequest, PlanResult, RunPlanRequest, ScenarioId, ScenarioManifest } from "@goplan/contracts";
import { PlanResultView } from "./components/PlanResult";
import { FormSection } from "./components/FormSection";
import { ScenarioCard } from "./components/ScenarioCard";
import { fetchPlan, fetchScenarios } from "./lib/api";
import { defaultPhotoForm, defaultRunForm, defaultScenarioId } from "./lib/constants";
import { detectLocation } from "./lib/geolocation";

export function App() {
  const [scenarios, setScenarios] = useState<ScenarioManifest[]>([]);
  const [scenarioId, setScenarioId] = useState<ScenarioId>(defaultScenarioId);
  const [runForm, setRunForm] = useState<RunPlanRequest>(defaultRunForm);
  const [photoForm, setPhotoForm] = useState<PhotoWeekRequest>(defaultPhotoForm);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "detecting" | "done" | "failed">("idle");
  const initializedRef = useRef(false);

  /** Apply detected (or re-detected) location to both forms. */
  function applyLocation(loc: { latitude: number; longitude: number; label?: string }, tz: string) {
    setRunForm((prev) => ({ ...prev, location: loc, timezone: tz }));
    setPhotoForm((prev) => ({ ...prev, location: loc, timezone: tz }));
  }

  function handleDetectLocation() {
    setGeoStatus("detecting");
    detectLocation()
      .then(({ location, timezone }) => {
        applyLocation(location, timezone);
        setGeoStatus("done");
      })
      .catch(() => {
        setGeoStatus("failed");
      });
  }

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;

    // Auto-detect location on first load
    handleDetectLocation();

    fetchScenarios()
      .then((data) => {
        setScenarios(data);
        const first = data[0];
        if (first) {
          setScenarioId((cur) => (data.some((s) => s.id === cur) ? cur : first.id));
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "场景加载失败");
      });
  }, []);

  const activeScenario = useMemo(
    () => scenarios.find((s) => s.id === scenarioId) ?? null,
    [scenarios, scenarioId],
  );

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const payload = scenarioId === "run_tomorrow" ? runForm : photoForm;
      setResult(await fetchPlan(scenarioId, payload));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "规划生成失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 lg:px-8">
      {/* ── Header ── */}
      <header className="mb-16">
        <p className="text-tertiary mb-4 text-sm tracking-widest uppercase">智能活动规划</p>
        <h1 className="font-serif text-5xl font-bold leading-tight tracking-tight">GoPlan</h1>
        <p className="text-secondary mt-4 max-w-2xl text-lg leading-relaxed">
          基于真实天气、地点与路线数据，为你的跑步和摄影做出优雅的规划。
        </p>
        {activeScenario && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-1.5 py-1.5 px-3 text-sm bg-surface-gray text-secondary">
            当前：<span className="text-primary font-medium">{activeScenario.title}</span>
          </div>
        )}
      </header>

      {/* ── Scenario selector ── */}
      <section aria-label="场景选择" className="mb-14">
        <h2 className="font-serif mb-6 text-xl font-semibold">选择场景</h2>
        <div className="grid gap-4 sm:grid-cols-2" role="listbox" aria-label="场景列表">
          {scenarios.map((s) => (
            <ScenarioCard key={s.id} scenario={s} active={s.id === scenarioId} onSelect={setScenarioId} />
          ))}
        </div>
      </section>

      <hr className="border-none border-t border-t-solid border-t-edge-light m-0 mb-14" />

      {/* ── Form + Result ── */}
      <div className="grid gap-14 xl:grid-cols-[400px_minmax(0,1fr)]">
        {/* Left: form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          className="space-y-8"
        >
          <FormSection
            scenarioId={scenarioId}
            runForm={runForm}
            photoForm={photoForm}
            onRunChange={setRunForm}
            onPhotoChange={setPhotoForm}
            geoStatus={geoStatus}
            onRelocate={handleDetectLocation}
          />
          <button type="submit" disabled={loading} className="n-btn-submit">
            {loading ? "规划生成中…" : "生成规划"}
          </button>
        </form>

        {/* Right: result */}
        <section aria-label="规划结果" aria-live="polite">
          {error && (
            <div className="rounded-2 border border-solid border-error-border bg-error-bg text-error-text py-3 px-4 text-sm mb-6" role="alert">
              {error}
            </div>
          )}
          <PlanResultView plan={result} />
        </section>
      </div>
    </div>
  );
}
