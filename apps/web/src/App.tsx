import { useEffect, useMemo, useRef, useState } from "react";
import type {
  PhotoWeekRequest,
  PlanExecutionLogEntry,
  PlanExecutionStage,
  PlanExecutionStageStatus,
  PlanResult,
  RunPlanRequest,
  ScenarioId,
  ScenarioManifest
} from "@goplan/contracts";
import { PlanResultView } from "./components/PlanResult";
import { FormSection } from "./components/FormSection";
import { ScenarioCard } from "./components/ScenarioCard";
import { fetchScenarios, streamPlan } from "./lib/api";
import { defaultPhotoForm, defaultRunForm, defaultScenarioId } from "./lib/constants";
import { detectLocation } from "./lib/geolocation";

export function App() {
  const [scenarios, setScenarios] = useState<ScenarioManifest[]>([]);
  const [scenarioId, setScenarioId] = useState<ScenarioId>(defaultScenarioId);
  const [runForm, setRunForm] = useState<RunPlanRequest>(defaultRunForm);
  const [photoForm, setPhotoForm] = useState<PhotoWeekRequest>(defaultPhotoForm);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [executionStages, setExecutionStages] = useState<PlanExecutionStage[]>([]);
  const [executionStageStatuses, setExecutionStageStatuses] = useState<Record<string, PlanExecutionStageStatus>>({});
  const [executionLogs, setExecutionLogs] = useState<PlanExecutionLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "detecting" | "done" | "failed">("idle");
  const initializedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

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

  useEffect(() => () => {
    abortControllerRef.current?.abort();
  }, []);

  const activeScenario = useMemo(
    () => scenarios.find((s) => s.id === scenarioId) ?? null,
    [scenarios, scenarioId]
  );

  async function handleSubmit() {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    setResult(null);
    setExecutionStages([]);
    setExecutionStageStatuses({});
    setExecutionLogs([]);

    try {
      const payload = scenarioId === "run_tomorrow" ? runForm : photoForm;
      await streamPlan(scenarioId, payload, {
        signal: controller.signal,
        onEvent: (event) => {
          switch (event.type) {
            case "start": {
              setExecutionStages(event.stages);
              setExecutionStageStatuses(Object.fromEntries(event.stages.map((stage) => [stage.id, "pending"] as const)));
              setExecutionLogs([]);
              break;
            }
            case "stage":
              setExecutionStageStatuses((prev) => ({
                ...prev,
                [event.stage.id]: event.status
              }));
              break;
            case "log":
              setExecutionLogs((prev) => [...prev, event.entry]);
              break;
            case "result":
              setResult(event.data);
              break;
            case "error":
              setResult(null);
              setError(event.message);
              break;
          }
        }
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }

      setResult(null);
      setError(err instanceof Error ? err.message : "规划生成失败");
    } finally {
      setLoading(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:px-8 lg:px-12 relative z-10">
      <header className="mb-20">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-12">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-0 py-1 text-accent-indigo text-xs font-bold tracking-widest uppercase mb-6 border-none">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-indigo"></span>
              智能活动规划
            </div>
            <h1 className="text-5xl sm:text-6xl font-bold leading-tight tracking-tight text-primary mb-6">
              GoPlan
            </h1>
            <p className="text-secondary text-lg sm:text-xl leading-relaxed max-w-xl">
              基于真实天气、地点与路线数据，为你的跑步和摄影做出优雅的规划。
            </p>
          </div>

          {activeScenario && (
            <div className="flex items-center gap-4 shrink-0 p-1">
              <div className="w-10 h-10 rounded-lg bg-surface-gray flex items-center justify-center text-primary font-bold text-lg border border-solid border-edge">
                {activeScenario.title[0]}
              </div>
              <div>
                <div className="text-[10px] text-tertiary font-bold uppercase tracking-widest mb-0.5">场景</div>
                <div className="text-primary font-bold text-base">{activeScenario.title}</div>
              </div>
            </div>
          )}
        </div>
      </header>

      <section aria-label="场景选择" className="mb-20">
        <h2 className="mb-8 text-xl font-bold tracking-tight text-primary flex items-center gap-3">
          选择场景 <span className="text-tertiary font-normal text-sm hidden sm:inline">— 开启你的专属规划</span>
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" role="listbox" aria-label="场景列表">
          {scenarios.map((s) => (
            <ScenarioCard key={s.id} scenario={s} active={s.id === scenarioId} onSelect={setScenarioId} />
          ))}
        </div>
      </section>

      <div className="grid gap-12 lg:grid-cols-12 items-start">
        <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-12">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            className="n-glass-card p-8 space-y-10"
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

            <div className="pt-6">
              <button type="submit" disabled={loading} className="n-btn-submit flex items-center justify-center gap-2 w-full">
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    生成中…
                  </>
                ) : (
                  "生成规划"
                )}
              </button>
            </div>
          </form>
        </div>

        <section aria-label="规划结果" aria-live="polite" className="lg:col-span-7 xl:col-span-8">
          {error && (
            <div className="bg-error-bg text-error-text py-4 px-6 text-sm mb-8 rounded-lg border border-solid border-error-border flex items-center gap-4" role="alert">
              <span className="text-xl">⚠️</span>
              <div className="font-bold">{error}</div>
            </div>
          )}
          <PlanResultView
            plan={result}
            stages={executionStages}
            stageStatuses={executionStageStatuses}
            logs={executionLogs}
            loading={loading}
          />
        </section>
      </div>
    </div>
  );
}
