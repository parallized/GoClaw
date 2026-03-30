import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import AMapLoader from "@amap/amap-jsapi-loader";
import type { Coordinates, PlanResult, RunRoute } from "@goclaw/contracts";

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

export type CollectionState = {
  visitedNames: string[];
  devices: string[];
  preferredMode: "walk" | "mixed";
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

  return plan.days.flatMap((day, dayIndex) => day.spots.map((spot, spotIndex) => ({
    id: `photo-${dayIndex}-${spotIndex}-${spot.name}`,
    name: spot.name,
    source: "photo",
    navigationUrl: spot.navigationUrl,
    coordinates: spot.poiCoordinates,
    recommendedTime: spot.bestTime,
    note: day.date
  })));
}

function parseLinePath(route: RunRoute): [number, number][] {
  return [
    [route.poiCoordinates.longitude, route.poiCoordinates.latitude]
  ];
}

export function NavigationStack({
  open,
  mode,
  onClose,
  location,
  result,
  collection,
  onCollectionChange
}: {
  open: boolean;
  mode: "navigation" | "collection";
  onClose: () => void;
  location: Coordinates;
  result: PlanResult | null;
  collection: CollectionState;
  onCollectionChange: (next: CollectionState) => void;
}) {
  const reservations = useMemo(() => buildReservationItems(result), [result]);
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!reservations.length) {
      setSelectedReservationId(null);
      return;
    }

    setSelectedReservationId((current) => current && reservations.some((item) => item.id === current) ? current : reservations[0]?.id ?? null);
  }, [reservations]);

  const selectedReservation = reservations.find((item) => item.id === selectedReservationId) ?? null;

  useEffect(() => {
    if (!open || mode !== "navigation") {
      return;
    }

    (window as any)._AMapSecurityConfig = {
      securityJsCode: import.meta.env.VITE_AMAP_SECURITY_CODE || ""
    };

    AMapLoader.load({
      key: import.meta.env.VITE_AMAP_JS_KEY || "2d201c10d7a04910ea0f05fbc316f728",
      version: "2.0",
      plugins: ["AMap.Scale", "AMap.ToolBar", "AMap.Polyline", "AMap.Marker"]
    }).then((AMap) => {
      if (!mapContainerRef.current || mapRef.current) {
        return;
      }

      mapRef.current = new AMap.Map(mapContainerRef.current, {
        viewMode: "3D",
        zoom: 12,
        pitch: 25,
        center: [location.longitude, location.latitude],
        mapStyle: document.documentElement.classList.contains("dark") ? "amap://styles/dark" : "amap://styles/whitesmoke"
      });
    }).catch((error) => {
      console.warn("Navigation map init failed", error);
    });

    return () => {
      polylineRef.current?.setMap?.(null);
      polylineRef.current = null;
      markersRef.current.forEach((marker) => marker.setMap?.(null));
      markersRef.current = [];
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, [open, mode, location.latitude, location.longitude]);

  useEffect(() => {
    if (!open || mode !== "navigation" || !mapRef.current || !selectedReservation) {
      return;
    }

    const AMap = (window as any).AMap;
    if (!AMap) {
      return;
    }

    polylineRef.current?.setMap?.(null);
    markersRef.current.forEach((marker) => marker.setMap?.(null));
    markersRef.current = [];

    const path: [number, number][] = [
      [location.longitude, location.latitude],
      [selectedReservation.coordinates.longitude, selectedReservation.coordinates.latitude]
    ];

    polylineRef.current = new AMap.Polyline({
      path,
      strokeColor: selectedReservation.source === "run" ? "#22d3ee" : "#f472b6",
      strokeWeight: 5,
      strokeOpacity: 0.9,
      lineJoin: "round",
      lineCap: "round",
      showDir: true
    });
    polylineRef.current.setMap(mapRef.current);

    const startMarker = new AMap.Marker({
      position: path[0],
      map: mapRef.current,
      label: { content: "起点", direction: "top" }
    });
    const endMarker = new AMap.Marker({
      position: path[1],
      map: mapRef.current,
      label: { content: selectedReservation.name, direction: "top" }
    });

    markersRef.current = [startMarker, endMarker];
    mapRef.current.setFitView([polylineRef.current, ...markersRef.current], false, [72, 72, 72, 72]);
  }, [open, mode, selectedReservation, location.longitude, location.latitude]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.aside
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 28 }}
          transition={{ duration: 0.25, ease: [0.19, 1, 0.22, 1] }}
          className="absolute inset-y-4 right-4 z-[70] w-[min(420px,calc(100vw-2rem))] rounded-3xl border border-white/10 bg-surface/90 backdrop-blur-2xl shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <div>
              <div className="text-primary font-semibold text-base">{mode === "navigation" ? "导航" : "收藏"}</div>
              <div className="text-tertiary text-xs mt-1">{mode === "navigation" ? "查看现有预约并预览路线" : "管理去过的地点、设备与偏好"}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full border border-white/10 bg-surface-gray/60 text-secondary hover:text-primary transition-colors flex items-center justify-center"
              aria-label="关闭面板"
            >
              <Icon icon="lucide:x" className="text-base" />
            </button>
          </div>

          {mode === "navigation" ? (
            <div className="h-full flex flex-col">
              <div className="px-5 py-4 border-b border-white/5 space-y-3 max-h-60 overflow-y-auto">
                {reservations.length > 0 ? reservations.map((item) => {
                  const active = item.id === selectedReservationId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedReservationId(item.id)}
                      className={`w-full text-left rounded-2xl border px-4 py-3 transition-all ${active ? "border-accent-blue bg-accent-blue/10" : "border-white/8 bg-surface-gray/30 hover:bg-surface-gray/60"}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-primary font-medium">{item.name}</div>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-tertiary">{item.source === "run" ? "run" : "photo"}</span>
                      </div>
                      <div className="mt-2 text-xs text-secondary flex flex-wrap gap-2">
                        {item.recommendedTime ? <span>{item.recommendedTime}</span> : null}
                        {item.timeWindow ? <span>{item.timeWindow.from}-{item.timeWindow.to}</span> : null}
                        <span>{item.note}</span>
                      </div>
                    </button>
                  );
                }) : (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-secondary">暂无可用预约，先完成一次规划。</div>
                )}
              </div>

              <div className="px-5 py-4 border-b border-white/5 space-y-2">
                <div className="text-primary font-medium">{selectedReservation?.name ?? "未选择路线"}</div>
                <div className="text-xs text-secondary">
                  {selectedReservation?.timeWindow ? `建议 ${selectedReservation.timeWindow.from}-${selectedReservation.timeWindow.to}` : "选择一条预约后可预览路线"}
                </div>
                {selectedReservation ? (
                  <a
                    href={selectedReservation.navigationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-surface-gray/60 px-3 py-2 text-xs font-medium text-primary hover:bg-surface-gray transition-colors"
                  >
                    打开外部导航 <Icon icon="lucide:arrow-up-right" className="text-sm" />
                  </a>
                ) : null}
              </div>

              <div className="flex-1 min-h-[280px] bg-surface-gray/20">
                <div ref={mapContainerRef} className="h-full w-full" />
              </div>
            </div>
          ) : (
            <div className="px-5 py-5 space-y-5 overflow-y-auto h-full">
              <section className="space-y-3">
                <div className="text-xs uppercase tracking-[0.2em] text-tertiary">已去过</div>
                <div className="flex flex-wrap gap-2">
                  {collection.visitedNames.length > 0 ? collection.visitedNames.map((name) => (
                    <span key={name} className="map-tag map-tag--sage">{name}</span>
                  )) : <span className="text-sm text-secondary">暂无记录</span>}
                </div>
                {reservations.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const nextNames = new Set(collection.visitedNames);
                      reservations.forEach((item) => nextNames.add(item.name));
                      onCollectionChange({ ...collection, visitedNames: [...nextNames] });
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-surface-gray/50 px-3 py-2 text-xs text-primary"
                  >
                    导入当前结果
                  </button>
                ) : null}
              </section>

              <section className="space-y-3">
                <div className="text-xs uppercase tracking-[0.2em] text-tertiary">设备</div>
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
                    { value: "mixed", label: "混合方式" }
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
              </section>
            </div>
          )}
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
