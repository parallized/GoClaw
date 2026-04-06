import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import AMapLoader from "@amap/amap-jsapi-loader";
import type { Coordinates, PlanResult } from "@goclaw/contracts";

const DEFAULT_AMAP_KEY = "2d201c10d7a04910ea0f05fbc316f728";

export type ReservationItem = {
  id: string;
  name: string;
  source: "run" | "photo";
  navigationUrl: string;
  coordinates: Coordinates;
  recommendedTime?: string;
  timeWindow?: {
    from: string;
    to: string;
  };
  note: string;
};

export type ReservationTarget = Pick<ReservationItem, "name" | "source">;

export type CollectionState = {
  visitedNames: string[];
  devices: string[];
  preferredMode: "walk" | "mixed";
};

type RoutePlanState = {
  state: "idle" | "loading" | "success" | "error";
  summary: string;
  detail?: string;
};

function buildReservationItems(plan: PlanResult | null): ReservationItem[] {
  if (!plan) {
    return [];
  }

  if (plan.type === "run_tomorrow") {
    return plan.routes.map((route, index) => ({
      id: `run-${index}-${route.name}`,
      name: route.name,
      source: "run",
      navigationUrl: route.navigationUrl,
      coordinates: route.poiCoordinates,
      recommendedTime: route.recommendedTime,
      timeWindow: route.timeWindow,
      note: `${route.distanceKm} km · ${route.estTimeMin} 分钟`
    }));
  }

  return plan.days.flatMap((day, dayIndex) =>
    day.spots.map((spot, spotIndex) => ({
      id: `photo-${dayIndex}-${spotIndex}-${spot.name}`,
      name: spot.name,
      source: "photo",
      navigationUrl: spot.navigationUrl,
      coordinates: spot.poiCoordinates,
      recommendedTime: spot.bestTime,
      note: day.date
    }))
  );
}

function formatDistance(distance?: number): string | null {
  if (!distance || Number.isNaN(distance)) {
    return null;
  }

  if (distance >= 1000) {
    return `${(distance / 1000).toFixed(distance >= 10000 ? 0 : 1)} 公里`;
  }

  return `${Math.round(distance)} 米`;
}

function formatDuration(seconds?: number): string | null {
  if (!seconds || Number.isNaN(seconds)) {
    return null;
  }

  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`;
  }

  return `${totalMinutes} 分钟`;
}

function extractWalkingGuide(result: any): string | undefined {
  const instructions = result?.routes?.[0]?.steps
    ?.map((step: any) => step?.instruction || step?.road)
    .filter(Boolean)
    .slice(0, 3);

  return instructions?.length ? instructions.join("；") : undefined;
}

function extractTransferGuide(result: any): string | undefined {
  const segments = result?.plans?.[0]?.segments ?? [];
  const instructions = segments
    .flatMap((segment: any) => {
      const values: string[] = [];

      const walkingInstruction = segment?.walking?.steps
        ?.map((step: any) => step?.instruction || step?.road)
        .filter(Boolean)
        .slice(0, 1)?.[0];

      if (walkingInstruction) {
        values.push(walkingInstruction);
      }

      const busLineName = segment?.bus?.buslines?.[0]?.name;
      if (busLineName) {
        values.push(`乘坐 ${busLineName}`);
      }

      const railwayName = segment?.railway?.name;
      if (railwayName) {
        values.push(`搭乘 ${railwayName}`);
      }

      return values;
    })
    .slice(0, 3);

  return instructions.length ? instructions.join("；") : undefined;
}

function buildWalkingSummary(result: any): RoutePlanState {
  const route = result?.routes?.[0];
  const parts = [
    formatDistance(route?.distance),
    formatDuration(route?.time),
    route?.steps?.length ? `${route.steps.length} 段步行指引` : null
  ].filter(Boolean);

  return {
    state: "success",
    summary: parts.length > 0 ? `已生成步行路线：${parts.join(" · ")}` : "已生成步行路线。",
    detail: extractWalkingGuide(result)
  };
}

function buildTransferSummary(result: any): RoutePlanState {
  const plan = result?.plans?.[0];
  const parts = [
    formatDistance(plan?.distance),
    formatDuration(plan?.time),
    plan?.segments?.length ? `${plan.segments.length} 段换乘` : null
  ].filter(Boolean);

  return {
    state: "success",
    summary: parts.length > 0 ? `已生成高德路线：${parts.join(" · ")}` : "已生成高德路线。",
    detail: extractTransferGuide(result)
  };
}

function clearRouteArtifacts(routePlannerRef: React.MutableRefObject<any>, routePanelRef: React.MutableRefObject<HTMLDivElement | null>) {
  routePlannerRef.current?.clear?.();
  routePlannerRef.current = null;

  if (routePanelRef.current) {
    routePanelRef.current.innerHTML = "";
  }
}

export function NavigationStack({
  open = true,
  mode,
  target,
  onClose,
  location,
  result,
  collection,
  onCollectionChange
}: {
  open?: boolean;
  mode: "navigation" | "collection";
  target?: ReservationTarget | null;
  onClose: () => void;
  location: Coordinates;
  result: PlanResult | null;
  collection: CollectionState;
  onCollectionChange: (next: CollectionState) => void;
}) {
  const reservations = useMemo(() => buildReservationItems(result), [result]);
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const [routePlanState, setRoutePlanState] = useState<RoutePlanState>({
    state: "idle",
    summary: "请选择一个目的地开始内部导航。"
  });
  const [mapReady, setMapReady] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const routePanelRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const routePlannerRef = useRef<any>(null);

  useEffect(() => {
    if (!reservations.length) {
      setSelectedReservationId(null);
      return;
    }

    const preferredReservation = target
      ? reservations.find((item) => item.name === target.name && item.source === target.source)
      : null;

    setSelectedReservationId((current) => {
      if (preferredReservation) {
        return preferredReservation.id;
      }

      return current && reservations.some((item) => item.id === current)
        ? current
        : reservations[0]?.id ?? null;
    });
  }, [reservations, target]);

  const selectedReservation = reservations.find((item) => item.id === selectedReservationId) ?? null;

  useEffect(() => {
    if (!open || mode !== "navigation") {
      return;
    }

    let cancelled = false;

    (window as any)._AMapSecurityConfig = {
      securityJsCode: import.meta.env.VITE_AMAP_SECURITY_CODE || ""
    };

    AMapLoader.load({
      key: import.meta.env.VITE_AMAP_JS_KEY || DEFAULT_AMAP_KEY,
      version: "2.0",
      plugins: ["AMap.Scale", "AMap.ToolBar", "AMap.Walking", "AMap.Transfer"]
    })
      .then((AMap) => {
        if (cancelled || !mapContainerRef.current || mapRef.current) {
          return;
        }

        mapRef.current = new AMap.Map(mapContainerRef.current, {
          viewMode: "3D",
          zoom: 12,
          pitch: 25,
          center: [location.longitude, location.latitude],
          mapStyle: document.documentElement.classList.contains("dark") ? "amap://styles/dark" : "amap://styles/whitesmoke"
        });

        mapRef.current.addControl?.(new AMap.Scale());
        mapRef.current.addControl?.(new AMap.ToolBar({ position: "RB" }));
        setMapReady(true);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        console.warn("Navigation map init failed", error);
        setRoutePlanState({
          state: "error",
          summary: "地图初始化失败，暂时无法生成内部导航。",
          detail: error instanceof Error ? error.message : "请检查高德地图配置。"
        });
      });

    return () => {
      cancelled = true;
      setMapReady(false);
      clearRouteArtifacts(routePlannerRef, routePanelRef);

      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, [open, mode, location.latitude, location.longitude]);

  useEffect(() => {
    if (!open || mode !== "navigation" || !mapReady || !mapRef.current) {
      return;
    }

    if (!selectedReservation) {
      clearRouteArtifacts(routePlannerRef, routePanelRef);
      setRoutePlanState({
        state: "idle",
        summary: "请选择一个目的地开始内部导航。"
      });
      return;
    }

    const AMap = (window as any).AMap;
    if (!AMap) {
      return;
    }

    let cancelled = false;
    clearRouteArtifacts(routePlannerRef, routePanelRef);

    const origin = new AMap.LngLat(location.longitude, location.latitude);
    const destination = new AMap.LngLat(selectedReservation.coordinates.longitude, selectedReservation.coordinates.latitude);
    const plannerBaseOptions = {
      map: mapRef.current,
      panel: routePanelRef.current,
      autoFitView: true,
      hideMarkers: false
    };

    const setErrorState = (message?: string) => {
      setRoutePlanState({
        state: "error",
        summary: "未能生成内部导航路线。",
        detail: message || "请稍后重试，或改用外部导航。"
      });
    };

    const planWalking = () => {
      setRoutePlanState({
        state: "loading",
        summary: "正在使用高德地图规划步行路线…"
      });

      const walking = new AMap.Walking(plannerBaseOptions);
      routePlannerRef.current = walking;
      walking.search(origin, destination, (status: string, resultData: any) => {
        if (cancelled) {
          return;
        }

        if (status === "complete" && resultData) {
          setRoutePlanState(buildWalkingSummary(resultData));
          return;
        }

        setErrorState(resultData?.info);
      });
    };

    const planMixed = () => {
      if (!AMap.Transfer) {
        planWalking();
        return;
      }

      const city = location.label?.match(/[^省市区县]+市/)?.[0] || location.label || "";
      setRoutePlanState({
        state: "loading",
        summary: "正在使用高德地图规划混合路线…"
      });

      const transfer = new AMap.Transfer({
        ...plannerBaseOptions,
        city
      });
      routePlannerRef.current = transfer;

      transfer.search(origin, destination, (status: string, resultData: any) => {
        if (cancelled) {
          return;
        }

        if (status === "complete" && resultData?.plans?.length) {
          setRoutePlanState(buildTransferSummary(resultData));
          return;
        }

        clearRouteArtifacts(routePlannerRef, routePanelRef);
        planWalking();
      });
    };

    if (collection.preferredMode === "mixed") {
      planMixed();
    } else {
      planWalking();
    }

    return () => {
      cancelled = true;
      clearRouteArtifacts(routePlannerRef, routePanelRef);
    };
  }, [open, mode, mapReady, selectedReservation, location.longitude, location.latitude, location.label, collection.preferredMode]);

  if (!open) {
    return null;
  }

  return (
    <div className="relative h-full overflow-hidden rounded-t-lg md:rounded-t-xl border border-white/5 bg-surface/95 backdrop-blur-3xl shadow-[0_-16px_64px_rgba(0,0,0,0.36)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_38%)]" />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-white/5 px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-primary font-semibold text-base">
              <Icon icon={mode === "navigation" ? "lucide:map" : "lucide:gallery-vertical-end"} className="text-lg" />
              {mode === "navigation" ? "内部导航" : "收藏"}
            </div>
            <div className="text-tertiary text-xs mt-1">
              {mode === "navigation"
                ? "当前页内直接展示高德路线结果和步骤，不再只画一根线。"
                : "当前规划结果统一进入这层 stack 页面进行收藏与偏好管理。"}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full border border-white/10 bg-surface-gray/60 text-secondary hover:text-primary transition-colors flex items-center justify-center"
            aria-label="关闭当前 stack 页面"
          >
            <Icon icon="lucide:x" className="text-base" />
          </button>
        </div>

        {mode === "navigation" ? (
          <div className="grid flex-1 min-h-0 lg:grid-cols-[340px,minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col border-b border-white/5 lg:border-b-0 lg:border-r border-white/5">
              <div className="px-4 py-4 border-b border-white/5">
                <div className="text-xs uppercase tracking-[0.2em] text-tertiary">路线列表</div>
                <div className="mt-2 text-sm text-secondary">点击左侧路线后，右侧会切换为高德地图真实路线与步骤。</div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
                {reservations.length > 0 ? reservations.map((item) => {
                  const active = item.id === selectedReservationId;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedReservationId(item.id)}
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition-all ${active ? "border-accent-blue bg-accent-blue/10 shadow-lg shadow-accent-blue/10" : "border-white/10 bg-surface-gray/30 hover:bg-surface-gray/60"}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-primary">{item.name}</div>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-tertiary">{item.source}</span>
                      </div>
                      <div className="mt-2 text-xs text-secondary flex flex-wrap gap-2">
                        {item.recommendedTime ? <span>{item.recommendedTime}</span> : null}
                        {item.timeWindow ? <span>{item.timeWindow.from}-{item.timeWindow.to}</span> : null}
                        <span>{item.note}</span>
                      </div>
                    </button>
                  );
                }) : (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-secondary">
                    暂无可用路线，先完成一次规划。
                  </div>
                )}
              </div>
            </div>

            <div className="grid min-h-0 grid-rows-[auto,minmax(0,1fr)] xl:grid-rows-1 xl:grid-cols-[minmax(0,1.08fr),minmax(320px,0.92fr)]">
              <div className="border-b xl:border-b-0 xl:border-r border-white/5 min-h-0 flex flex-col">
                <div className="px-5 py-4 border-b border-white/5 space-y-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-primary font-medium">{selectedReservation?.name ?? "未选择路线"}</div>
                      <div className="text-xs text-secondary mt-1">
                        {selectedReservation?.timeWindow
                          ? `建议 ${selectedReservation.timeWindow.from}-${selectedReservation.timeWindow.to}`
                          : "选择左侧路线后即可查看高德返回的详细路径与步骤。"}
                      </div>
                    </div>

                    {selectedReservation ? (
                      <a
                        href={selectedReservation.navigationUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-surface-gray/60 px-3 py-2 text-xs font-medium text-primary hover:bg-surface-gray transition-colors"
                      >
                        外部导航兜底 <Icon icon="lucide:arrow-up-right" className="text-sm" />
                      </a>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "walk", label: "步行优先" },
                      { value: "mixed", label: "混合路线" }
                    ].map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => onCollectionChange({ ...collection, preferredMode: item.value as CollectionState["preferredMode"] })}
                        className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${collection.preferredMode === item.value ? "border-accent-indigo bg-accent-indigo/10 text-primary" : "border-white/10 bg-surface-gray/40 text-secondary"}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  <div className={`rounded-2xl border px-4 py-3 text-xs ${routePlanState.state === "error" ? "border-error-border bg-error-bg/30 text-error-text" : "border-white/10 bg-surface-gray/40 text-secondary"}`}>
                    <div>{routePlanState.summary}</div>
                    {routePlanState.detail ? <div className="mt-2 text-xs opacity-80 leading-relaxed">{routePlanState.detail}</div> : null}
                  </div>
                </div>

                <div className="flex-1 min-h-[280px] bg-surface-gray/20">
                  <div ref={mapContainerRef} className="h-full w-full" />
                </div>
              </div>

              <div className="min-h-0 flex flex-col bg-surface-gray/10">
                <div className="px-5 py-3 border-b border-white/5 text-sm font-medium text-primary">高德路线步骤</div>
                <div className="flex-1 min-h-[220px] overflow-y-auto px-5 py-4 bg-white/92 text-slate-800">
                  <div
                    ref={routePanelRef}
                    className="text-sm [&_.amap-lib-transfer]:bg-transparent [&_.amap-lib-transfer]:text-inherit [&_.amap-walk-route]:bg-transparent [&_.amap-walk-route]:text-inherit"
                  />
                  {!selectedReservation ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                      选择左侧目的地后，这里会展示高德地图返回的内部导航步骤。
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid flex-1 min-h-0 lg:grid-cols-[minmax(0,1fr),320px]">
            <div className="min-h-0 overflow-y-auto px-6 py-6 space-y-6">
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-tertiary">已收藏</div>
                    <div className="mt-1 text-sm text-secondary">加入收藏后的路线和地点都会集中显示在这里。</div>
                  </div>

                  {collection.visitedNames.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => onCollectionChange({ ...collection, visitedNames: [] })}
                      className="rounded-xl border border-white/10 bg-surface-gray/40 px-3 py-2 text-xs text-secondary"
                    >
                      清空
                    </button>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {collection.visitedNames.length > 0 ? collection.visitedNames.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => onCollectionChange({
                        ...collection,
                        visitedNames: collection.visitedNames.filter((item) => item !== name)
                      })}
                      className="map-tag map-tag--sage inline-flex items-center gap-1"
                    >
                      <span>{name}</span>
                      <Icon icon="lucide:x" className="text-xs" />
                    </button>
                  )) : <span className="text-sm text-secondary">还没有收藏任何路线或地点。</span>}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-tertiary">当前规划</div>
                    <div className="mt-1 text-sm text-secondary">把本次规划中的路线或地点加入收藏。</div>
                  </div>

                  {reservations.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        const nextNames = new Set(collection.visitedNames);
                        reservations.forEach((item) => nextNames.add(item.name));
                        onCollectionChange({ ...collection, visitedNames: [...nextNames] });
                      }}
                      className="rounded-xl border border-white/10 bg-surface-gray/40 px-3 py-2 text-xs text-primary"
                    >
                      收藏当前规划
                    </button>
                  ) : null}
                </div>

                <div className="space-y-3">
                  {reservations.length > 0 ? reservations.map((item) => {
                    const saved = collection.visitedNames.includes(item.name);

                    return (
                      <div key={item.id} className="rounded-2xl border border-white/10 bg-surface-gray/30 px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-primary">{item.name}</div>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-secondary">
                              {item.recommendedTime ? <span>{item.recommendedTime}</span> : null}
                              {item.timeWindow ? <span>{item.timeWindow.from}-{item.timeWindow.to}</span> : null}
                              <span>{item.note}</span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const nextNames = new Set(collection.visitedNames);
                              if (saved) {
                                nextNames.delete(item.name);
                              } else {
                                nextNames.add(item.name);
                              }
                              onCollectionChange({ ...collection, visitedNames: [...nextNames] });
                            }}
                            className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${saved ? "border-accent-green bg-accent-green/12 text-primary" : "border-white/10 bg-surface-gray/40 text-secondary"}`}
                          >
                            {saved ? "已收藏" : "加入收藏"}
                          </button>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-secondary">
                      当前还没有可收藏的规划结果。
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="min-h-0 overflow-y-auto border-t lg:border-t-0 lg:border-l border-white/5 px-6 py-6 space-y-6">
              <section className="space-y-3">
                <div className="text-xs uppercase tracking-[0.2em] text-tertiary">随身设备</div>
                <div className="flex flex-wrap gap-2">
                  {["手机", "耳机", "相机", "脚架"].map((device) => {
                    const active = collection.devices.includes(device);
                    return (
                      <button
                        key={device}
                        type="button"
                        onClick={() => onCollectionChange({
                          ...collection,
                          devices: active ? collection.devices.filter((item) => item !== device) : [...collection.devices, device]
                        })}
                        className={`map-tag ${active ? "map-tag--active map-tag--cyan" : "map-tag--slate"}`}
                      >
                        {device}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-3">
                <div className="text-xs uppercase tracking-[0.2em] text-tertiary">出行偏好</div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "walk", label: "步行优先" },
                    { value: "mixed", label: "混合路线" }
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => onCollectionChange({ ...collection, preferredMode: item.value as CollectionState["preferredMode"] })}
                      className={`rounded-2xl border px-4 py-3 text-sm transition-colors ${collection.preferredMode === item.value ? "border-accent-indigo bg-accent-indigo/10 text-primary" : "border-white/10 bg-surface-gray/30 text-secondary"}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="rounded-2xl border border-white/10 bg-surface-gray/30 px-4 py-3 text-xs text-secondary">
                  当前偏好会直接影响内部导航使用的高德路线规划方式。
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
