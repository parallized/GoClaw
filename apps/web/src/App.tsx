import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@iconify/react";
import type {
  PlanCandidatesDataPayload,
  PhotoWeekRequest,
  PlanExecutionLogEntry,
  PlanExecutionStage,
  PlanExecutionStageStatus,
  PlanResult,
  RunPlanRequest,
  ScenarioId,
  ScenarioManifest
} from "@goclaw/contracts";
import { FormSection, TimeWindowControl, TerrainControl, PhotoThemesControl, PhotoSkillControl, getTagColorHex } from "./components/FormSection";
import { NavigationStack, type CollectionState, type ReservationTarget } from "./components/NavigationStack";
import { ScenarioStep } from "./components/ScenarioStep";
import { fetchScenarios, streamPlan } from "./lib/api";
import { defaultScenarioId } from "./lib/constants";
import { detectLocation } from "./lib/geolocation";
import {
  loadPersistedPhotoForm,
  loadPersistedRunForm,
  savePersistedPhotoForm,
  savePersistedRunForm
} from "./lib/preference-storage";

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
type AppStep = "scenario" | "form";
type OverlayPanelState = {
  mode: "navigation" | "collection";
  target: ReservationTarget | null;
} | null;

const defaultCollectionState: CollectionState = {
  visitedNames: [],
  devices: [],
  preferredMode: "walk"
};

const emptyPoiCandidates: PlanCandidatesDataPayload = {
  rawCandidates: [],
  usableCandidates: [],
  recommendedCandidates: [],
  minimumSatisfied: false
};

export function App() {
  const [scenarios, setScenarios] = useState<ScenarioManifest[]>([]);
  const [scenarioId, setScenarioId] = useState<ScenarioId>(defaultScenarioId);
  const [runForm, setRunForm] = useState<RunPlanRequest>(() => loadPersistedRunForm());
  const [photoForm, setPhotoForm] = useState<PhotoWeekRequest>(() => loadPersistedPhotoForm());
  const [result, setResult] = useState<PlanResult | null>(null);
  const [executionStages, setExecutionStages] = useState<PlanExecutionStage[]>([]);
  const [executionStageStatuses, setExecutionStageStatuses] = useState<Record<string, PlanExecutionStageStatus>>({});
  const [appStep, setAppStep] = useState<AppStep>("scenario");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [currentWeather, setCurrentWeather] = useState<string>("");
  const [poiCandidates, setPoiCandidates] = useState<PlanCandidatesDataPayload>(emptyPoiCandidates);
  const [theme, setTheme] = useState<"light" | "dark" | "auto">("auto");
  const [overlayPanel, setOverlayPanel] = useState<OverlayPanelState>(null);
  const [collection, setCollection] = useState<CollectionState>(defaultCollectionState);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
    } else if (theme === "light") {
      root.classList.add("light");
      root.classList.remove("dark");
    } else {
      root.classList.remove("dark", "light");
    }
  }, [theme]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "detecting" | "done" | "failed">("idle");
  const initializedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const executionStageTitleRef = useRef<Record<string, string>>({});

  const isDark = theme === "dark" || (theme === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);

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

  useEffect(() => {
    savePersistedRunForm(runForm);
  }, [runForm]);

  useEffect(() => {
    savePersistedPhotoForm(photoForm);
  }, [photoForm]);

  const activeScenario = useMemo(
    () => scenarios.find((s) => s.id === scenarioId) ?? null,
    [scenarios, scenarioId]
  );

  function closeOverlayPanel() {
    setOverlayPanel(null);
  }

  function openOverlayPanel(mode: "navigation" | "collection", target: ReservationTarget | null = null) {
    setOverlayPanel({ mode, target: mode === "navigation" ? target : null });
  }

  function handleReserve(plan: PlanResult) {
    const names = plan.type === "run_tomorrow"
      ? plan.routes.map((route) => route.name)
      : plan.days.flatMap((day) => day.spots.map((spot) => spot.name));
    setCollection((prev) => ({
      ...prev,
      visitedNames: [...new Set([...prev.visitedNames, ...names])]
    }));
    openOverlayPanel("collection");
  }

  function handleOpenNavigation(target?: ReservationTarget) {
    openOverlayPanel("navigation", target ?? null);
  }

  async function handleSubmit() {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    setResult(null);
    setIsGenerating(true);
    setCurrentWeather("");
    setPoiCandidates(emptyPoiCandidates);
    setExecutionStages([]);
    setExecutionStageStatuses({});
    closeOverlayPanel();
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
              setIsGenerating(false);
              break;
            case "error":
              setResult(null);
              setIsGenerating(false);
              setError(event.message);
              break;
            case "data":
              if (event.dataType === "weather") {
                setCurrentWeather(event.payload.label);
              } else if (event.dataType === "candidates") {
                setPoiCandidates(event.payload);
              }
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
      setIsGenerating(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }

  const steps: AppStep[] = ["scenario", "form"];
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
              <motion.div
                key={step}
                className="absolute inset-0 origin-top rounded-t-2xl md:rounded-t-3xl"
                animate={{
                  opacity: isCurrent ? 1 : Math.max(0, 1 - diff * 0.4),
                  y: isCurrent ? 0 : -(diff * 28),
                  scale: isCurrent ? 1 : Math.max(0.85, 1 - diff * 0.045),
                }}
                transition={{ type: "spring", stiffness: 300, damping: 35 }}
                style={{
                  zIndex: 10 - diff,
                  pointerEvents: isCurrent ? "auto" : "none",
                }}
              >
                {/* 全局统一的左上角悬浮操作栏 */}
                {isCurrent && (
                  <div className="absolute top-6 left-4 md:-left-16 z-50 flex flex-col gap-3 pointer-events-auto">
                    {step !== "scenario" && (
                      <button
                        type="button"
                        onClick={() => { abortControllerRef.current?.abort(); setAppStep("scenario"); }}
                        className="w-10 h-10 rounded-full bg-surface/80 backdrop-blur-xl hover:bg-surface-hover border border-white/10 flex items-center justify-center text-tertiary hover:text-primary transition-all cursor-pointer shadow-sm"
                        aria-label="放弃当前并返回大厅"
                      >
                        <Icon icon="lucide:x" className="text-[18px]" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        const isCurrentlyDark = theme === "dark" || (theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
                        setTheme(isCurrentlyDark ? "light" : "dark");
                      }}
                      className="w-10 h-10 rounded-full bg-surface/80 backdrop-blur-xl hover:bg-surface-hover border border-white/10 flex items-center justify-center text-tertiary hover:text-primary transition-all cursor-pointer shadow-sm"
                      aria-label="切换日夜模式"
                      >
                        {theme === "dark" || (theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches) ? (
                          <Icon icon="lucide:sun-medium" className="text-[18px]" />
                      ) : (
                        <Icon icon="lucide:moon-star" className="text-[18px]" />
                        )}
                      </button>

                      {step === "form" && result ? (
                        <>
                          <button
                            type="button"
                            onClick={() => overlayPanel?.mode === "navigation" ? closeOverlayPanel() : openOverlayPanel("navigation")}
                            className="w-10 h-10 rounded-full bg-surface/80 backdrop-blur-xl hover:bg-surface-hover border border-white/10 flex items-center justify-center text-tertiary hover:text-primary transition-all cursor-pointer shadow-sm"
                            aria-label="打开导航页面"
                          >
                            <Icon icon="lucide:map" className="text-[18px]" />
                          </button>

                          <button
                            type="button"
                            onClick={() => overlayPanel?.mode === "collection" ? closeOverlayPanel() : openOverlayPanel("collection")}
                            className="w-10 h-10 rounded-full bg-surface/80 backdrop-blur-xl hover:bg-surface-hover border border-white/10 flex items-center justify-center text-tertiary hover:text-primary transition-all cursor-pointer shadow-sm"
                            aria-label="打开收藏页面"
                          >
                            <Icon icon="lucide:gallery-vertical-end" className="text-[18px]" />
                          </button>
                        </>
                      ) : null}
                  </div>
                )}
                <div className="relative shadow-[0_-16px_64px_rgba(0,0,0,0.3)] h-full flex flex-col w-full border-t border-l border-r border-b-0 border-white/5 bg-surface/80 backdrop-blur-3xl overflow-hidden rounded-t-lg md:rounded-t-xl rounded-b-none">

                  <div className={`flex-1 flex flex-col w-full h-full overflow-y-auto overflow-x-hidden p-6 sm:p-12 ${step !== "scenario" ? "pt-12 sm:pt-16" : ""}`}>
                    {step === "scenario" && (
                      <ScenarioStep
                        scenarios={scenarios}
                        onSelect={(id) => { setScenarioId(id); setAppStep("form"); }}
                      />
                    )}

                    {step === "form" && (
                      <motion.div
                        className="flex flex-col flex-1 h-full relative pt-8 sm:pt-12"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, ease: [0.19, 1, 0.22, 1] }}
                      >
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void handleSubmit();
                          }}
                          className="flex flex-col flex-1 h-full"
                        >
                          <div className="flex flex-col h-full w-full max-w-5xl mx-auto px-4 sm:px-6">

                            {/* Header Area */}
                            <div className="w-full flex flex-col mb-4 z-10 shrink-0 text-center sm:text-left">
                              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-primary leading-tight mb-2">
                                {scenarios.find(s => s.id === scenarioId)?.title || "高级规划设定"}
                              </h1>
                              <p className="text-secondary text-[14px] leading-relaxed mb-4 max-w-2xl sm:mx-0 mx-auto">
                                打算去哪，或者只是走走？
                              </p>

                              <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4 w-full">
                                <button type="submit" disabled={loading} className="flex items-center justify-center gap-2 px-8 py-3 text-sm font-bold bg-primary hover:opacity-90 rounded-xl transition-all shadow-lg w-full sm:w-fit border border-transparent hover:scale-[1.02] active:scale-95 shrink-0" style={{ color: "var(--color-base-bg)" }}>
                                  {loading ? "正在推演..." : "生成规划"}
                                </button>

                                <div className="flex-1 w-full sm:w-auto animate-in fade-in slide-in-from-left-4 duration-700 delay-100">
                                  {scenarioId === "run_tomorrow" ? (
                                    <TimeWindowControl
                                      from={runForm.preferences?.startWindow?.from ?? "06:00"}
                                      to={runForm.preferences?.startWindow?.to ?? "10:00"}
                                      colors={runForm.preferences?.terrain?.map(getTagColorHex) ?? []}
                                      onChange={(from, to) => setRunForm({ ...runForm, preferences: { ...runForm.preferences!, startWindow: { from, to } } })}
                                    />
                                  ) : (
                                    <PhotoSkillControl
                                      skill={photoForm.preferences?.cameraSkill ?? "beginner"}
                                      onChange={(val) => setPhotoForm({ ...photoForm, preferences: { ...photoForm.preferences, cameraSkill: val } })}
                                    />
                                  )}
                                </div>
                              </div>

                              <div className="mt-4 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
                                {scenarioId === "run_tomorrow" ? (
                                  <TerrainControl
                                    selected={runForm.preferences?.terrain ?? []}
                                    onChange={(val) => setRunForm({ ...runForm, preferences: { ...runForm.preferences, terrain: val as any } })}
                                  />
                                ) : (
                                  <PhotoThemesControl
                                    selected={photoForm.preferences?.themes ?? []}
                                    onChange={(val) => setPhotoForm({ ...photoForm, preferences: { ...photoForm.preferences, themes: val as any } })}
                                  />
                                )}
                              </div>
                            </div>

                            {/* Map Container Area */}
                            <div className="flex-1 w-full min-h-[500px] h-full relative z-0 mb-6 sm:mb-8">
                                <FormSection
                                  scenarioId={scenarioId}
                                  themeMode={isDark ? "dark" : "light"}
                                  runForm={runForm}
                                  photoForm={photoForm}
                                  onRunChange={setRunForm}
                                  onPhotoChange={setPhotoForm}
                                  geoStatus={geoStatus}
                                  onRelocate={handleDetectLocation}
                                  isGenerating={isGenerating}
                                  currentWeather={currentWeather}
                                  poiCandidates={poiCandidates}
                                  result={result}
                                  onNavigate={(target) => openOverlayPanel("navigation", target)}
                                />
                            </div>

                          </div>
                        </form>
                      </motion.div>
                    )}

                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
