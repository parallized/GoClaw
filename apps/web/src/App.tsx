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
} from "@goclaw/contracts";
import { PlanResultView, ExecutionPanel } from "./components/PlanResult";
import { FormSection } from "./components/FormSection";
import { ScenarioCard } from "./components/ScenarioCard";
import { fetchScenarios, streamPlan } from "./lib/api";
import { defaultPhotoForm, defaultRunForm, defaultScenarioId } from "./lib/constants";
import { detectLocation } from "./lib/geolocation";

function writeExecutionLogToConsole(entry: PlanExecutionLogEntry, stageTitle?: string) {
  const time = new Date(entry.timestamp).toLocaleTimeString("zh-CN", { hour12: false });
  const stageSegment = stageTitle ? `[${stageTitle}]` : "";
  const message = `[规划日志][${time}]${stageSegment} ${entry.message}`;
  const args = entry.detail ? [message, entry.detail] : [message];

  switch (entry.level) {
    case "error":
      console.error(...args);
      break;
    case "warn":
      console.warn(...args);
      break;
    default:
      console.info(...args);
      break;
  }
}

type AppStep = "scenario" | "form" | "execution" | "result";

export function App() {
  const [scenarios, setScenarios] = useState<ScenarioManifest[]>([]);
  const [scenarioId, setScenarioId] = useState<ScenarioId>(defaultScenarioId);
  const [runForm, setRunForm] = useState<RunPlanRequest>(defaultRunForm);
  const [photoForm, setPhotoForm] = useState<PhotoWeekRequest>(defaultPhotoForm);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [executionStages, setExecutionStages] = useState<PlanExecutionStage[]>([]);
  const [executionStageStatuses, setExecutionStageStatuses] = useState<Record<string, PlanExecutionStageStatus>>({});
  const [appStep, setAppStep] = useState<AppStep>("scenario");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "detecting" | "done" | "failed">("idle");
  const initializedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const executionStageTitleRef = useRef<Record<string, string>>({});

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
    setAppStep("execution");
    executionStageTitleRef.current = {};

    try {
      const payload = scenarioId === "run_tomorrow" ? runForm : photoForm;
      await streamPlan(scenarioId, payload, {
        signal: controller.signal,
        onEvent: (event) => {
          switch (event.type) {
            case "start": {
              setExecutionStages(event.stages);
              setExecutionStageStatuses(Object.fromEntries(event.stages.map((stage) => [stage.id, "pending"] as const)));
              executionStageTitleRef.current = Object.fromEntries(event.stages.map((stage) => [stage.id, stage.title]));
              break;
            }
            case "stage":
              setExecutionStageStatuses((prev) => ({
                ...prev,
                [event.stage.id]: event.status
              }));
              break;
            case "log": {
              const stageTitle = executionStageTitleRef.current[event.entry.stageId];
              writeExecutionLogToConsole(event.entry, stageTitle);
              break;
            }
            case "result":
              setResult(event.data);
              setAppStep("result");
              break;
            case "error":
              setResult(null);
              setError(event.message);
              setAppStep("form");
              break;
          }
        }
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setAppStep("scenario");
        return;
      }

      setResult(null);
      setError(err instanceof Error ? err.message : "规划生成失败");
      setAppStep("form");
    } finally {
      setLoading(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }

  const steps: AppStep[] = ["scenario", "form", "execution", "result"];
  const currentStepIndex = steps.indexOf(appStep);

  return (
    <div className="mx-auto max-w-5xl px-4 pt-4 pb-0 sm:pt-8 sm:px-8 lg:px-12 relative z-10 h-[100dvh] flex flex-col overflow-hidden">
      <main className="relative flex-1 w-full min-h-0 flex flex-col">
        {error && appStep !== "scenario" && (
          <div className="bg-error-bg/50 backdrop-blur-md text-error-text py-4 px-6 text-sm mb-8 rounded-xl border border-error-border flex items-center gap-4 shadow-sm animate-fade-in absolute top-[-80px] left-0 right-0 z-50" role="alert">
            <span className="text-xl">⚠️</span>
            <div className="font-bold">{error}</div>
          </div>
        )}

        <div className="relative max-w-3xl mx-auto w-full flex-1 min-h-0 mt-4 sm:mt-6 pb-0">
          {steps.map((step, index) => {
            const diff = currentStepIndex - index;
            if (diff < 0) return null; // 隐藏未来的卡片

            // 只有正在展示的场景卡片会被激活为可交互
            const isCurrent = diff === 0;

            return (
              <div
                key={step}
                className={`absolute inset-0 origin-top transition-all duration-700 ease-[cubic-bezier(0.19,1,0.22,1)] rounded-t-2xl md:rounded-t-3xl pointer-events-none`}
                style={{
                  zIndex: 10 - diff,
                  opacity: isCurrent ? 1 : Math.max(0, 1 - diff * 0.4),
                  transform: isCurrent ? "none" : `translateY(-${diff * 28}px) scale(${1 - diff * 0.045})`,
                  pointerEvents: isCurrent ? "auto" : "none",
                }}
              >
                <div className="relative shadow-[0_-16px_64px_rgba(0,0,0,0.3)] h-full flex flex-col w-full border-t border-l border-r border-b-0 border-white/5 bg-surface/80 backdrop-blur-3xl overflow-hidden rounded-t-2xl md:rounded-t-3xl rounded-b-none">

                  {/* 全局统一的左上角悬浮返回按钮 */}
                  {step !== "scenario" && (
                    <button
                      type="button"
                      onClick={() => { abortControllerRef.current?.abort(); setAppStep("scenario"); }}
                      className="absolute top-6 left-6 w-10 h-10 rounded-full bg-surface-gray hover:bg-surface-hover border border-white/5 flex items-center justify-center text-tertiary hover:text-primary transition-all cursor-pointer shadow-sm z-50 pointer-events-auto"
                      aria-label="放弃当前并返回大厅"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  )}

                  <div className={`flex-1 flex flex-col w-full h-full overflow-y-auto overflow-x-hidden p-6 sm:p-12 ${step !== "scenario" ? "pt-20 sm:pt-24" : ""}`}>
                    {step === "scenario" && (
                      <div className="flex flex-col h-full animate-fade-in">
                        <header className="mb-14">
                          <div className="inline-flex items-center gap-2 px-0 py-1 text-accent-indigo text-sm font-bold tracking-widest uppercase mb-4 border-none">
                            <span className="w-1.5 h-1.5 rounded-full bg-accent-indigo shadow-[0_0_8px_rgba(82,93,243,0.6)]"></span>
                            智能活动规划
                          </div>
                          <h1 className="text-4xl sm:text-5xl font-bold leading-tight tracking-tight text-primary mb-4">
                            GoClaw
                          </h1>
                          <p className="text-secondary text-base sm:text-lg leading-relaxed max-w-xl mb-0">
                            基于真实天气、地点与路线数据，为你的跑步和摄影做出优雅的规划。
                          </p>
                        </header>
                        <section aria-label="场景选择" className="flex-1">
                          <h2 className="mb-8 text-xl font-bold tracking-tight text-primary flex items-center gap-3">
                            选择场景 <span className="text-tertiary font-normal text-sm hidden sm:inline">— 开启专属规划</span>
                          </h2>
                          <div className="grid gap-6 sm:grid-cols-2" role="listbox" aria-label="场景列表">
                            {scenarios.map((s) => (
                              <div key={s.id} onClick={() => { setScenarioId(s.id); setAppStep("form"); }}>
                                <ScenarioCard scenario={s} active={s.id === scenarioId} onSelect={() => { }} />
                              </div>
                            ))}
                          </div>
                        </section>
                      </div>
                    )}

                    {step === "form" && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void handleSubmit();
                        }}
                        className="flex flex-col flex-1 h-full animate-fade-in"
                      >
                        <div className="flex-1">
                          <FormSection
                            scenarioId={scenarioId}
                            runForm={runForm}
                            photoForm={photoForm}
                            onRunChange={setRunForm}
                            onPhotoChange={setPhotoForm}
                            geoStatus={geoStatus}
                            onRelocate={handleDetectLocation}
                          />
                        </div>

                        <div className="pt-8 border-t border-white/5 mt-12">
                          <button type="submit" disabled={loading} className="n-btn-submit flex items-center justify-center gap-2 w-full py-4 text-lg shadow-[0_8px_24px_rgba(82,93,243,0.3)] hover:shadow-[0_12px_32px_rgba(82,93,243,0.5)] transition-all">
                            {loading ? "准备中..." : "生成规划 (✨ AI)"}
                          </button>
                        </div>
                      </form>
                    )}

                    {step === "execution" && (
                      <div className="flex-1 flex flex-col h-full animate-fade-in">
                        <ExecutionPanel stages={executionStages} stageStatuses={executionStageStatuses} loading={loading} />
                      </div>
                    )}

                    {step === "result" && (
                      <div className="flex-1 flex flex-col h-full animate-fade-in">
                        {result ? <PlanResultView plan={result} /> : <div className="text-center text-secondary py-20">无结果数据</div>}

                        <div className="mt-auto pt-16 text-center">
                          <button
                            onClick={() => { setAppStep("scenario"); setResult(null); }}
                            className="bg-surface/50 hover:bg-surface border border-white/10 px-8 py-3 text-sm font-bold text-primary transition-all uppercase tracking-[0.2em] shadow-sm hover:shadow-md cursor-pointer rounded-lg"
                          >
                            ↺ 重新规划
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
