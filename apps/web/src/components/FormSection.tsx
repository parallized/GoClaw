import { useState, useEffect, useRef } from "react";
import AMapLoader from "@amap/amap-jsapi-loader";
import { Icon } from "@iconify/react";
import type { CameraSkill, PhotoTheme, RunTerrain, ScenarioId } from "@goclaw/contracts";
import type { PhotoWeekRequest, RunPlanRequest } from "@goclaw/contracts";

interface FormSectionProps {
  scenarioId: ScenarioId;
  themeMode: "light" | "dark";
  runForm: RunPlanRequest;
  photoForm: PhotoWeekRequest;
  onRunChange: (next: RunPlanRequest) => void;
  onPhotoChange: (next: PhotoWeekRequest) => void;
  geoStatus: "idle" | "detecting" | "done" | "failed";
  onRelocate: () => void;
}

/* ── Data ── */

const runTerrains: Array<{ value: RunTerrain; label: string; icon: string }> = [
  { value: "park", label: "公园", icon: "lucide:tree-pine" },
  { value: "shaded", label: "树荫", icon: "lucide:leaf" },
  { value: "flat", label: "平路", icon: "lucide:footprints" },
  { value: "waterfront", label: "临水", icon: "lucide:waves" },
  { value: "track", label: "田径场", icon: "lucide:circle-dashed" },
];

const photoThemes: Array<{ value: PhotoTheme; label: string; icon: string }> = [
  { value: "nature", label: "自然", icon: "lucide:mountain" },
  { value: "architecture", label: "建筑", icon: "lucide:building-2" },
  { value: "humanity", label: "人文", icon: "lucide:users" },
  { value: "urban", label: "城市", icon: "lucide:map-pin" },
  { value: "night", label: "夜景", icon: "lucide:moon" },
  { value: "waterfront", label: "水边", icon: "lucide:waves" },
];

const cameraSkills: Array<{ value: CameraSkill; label: string }> = [
  { value: "beginner", label: "新手" },
  { value: "intermediate", label: "进阶" },
  { value: "advanced", label: "高级" },
];

/* ── Helpers ── */

function toggleInArray<T extends string>(arr: T[] | undefined, value: T): T[] {
  const set = new Set(arr ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return [...set];
}

/* ── Location display (auto-detected) ── */

interface LocationDisplayProps {
  label: string | undefined;
  latitude: number;
  longitude: number;
  geoStatus: "idle" | "detecting" | "done" | "failed";
  onRelocate: () => void;
}

function LocationDisplay({ label, latitude, longitude, geoStatus, onRelocate }: LocationDisplayProps) {
  return (
    <fieldset className="mb-10 border-none p-0">
      <legend className="mb-4 text-[10px] font-bold uppercase tracking-widest text-accent-blue flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-blue shadow-[0_0_8px_rgba(35,131,226,0.6)]"></span> 位置信息
      </legend>
      <div className="flex flex-col gap-4 rounded-xl border border-white/5 p-5 bg-surface/30 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] transition-all hover:bg-surface/40">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5 overflow-hidden">
            <div className="font-bold text-lg text-primary leading-tight truncate">
              {geoStatus === "detecting" ? "正在精准定位…" : (label || "默认位置")}
            </div>
            <div className="text-secondary tracking-wide text-sm font-bold uppercase opacity-70">
              {latitude.toFixed(4)}°N, {longitude.toFixed(4)}°E
            </div>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg bg-surface/40 border border-white/10 text-primary py-2 px-3 sm:px-4 text-sm font-bold cursor-pointer transition-transform hover:scale-105 active:scale-95 hover:bg-surface/60 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 uppercase tracking-widest shadow-sm"
            onClick={onRelocate}
            disabled={geoStatus === "detecting"}
          >
            {geoStatus === "detecting" ? "定位中" : "重新定位"}
          </button>
        </div>
        {geoStatus === "failed" && (
          <div className="text-sm mt-1 flex items-center gap-2 text-error-text font-bold bg-error-bg/50 backdrop-blur-sm p-3 rounded-lg border border-error-border">
            <span>⚠️</span> 定位失败，按默认位置呈现。
          </div>
        )}
      </div>
    </fieldset>
  );
}

/* ── Run preferences form ── */

function RunPreferencesFields({ form, onChange }: { form: RunPlanRequest; onChange: (next: RunPlanRequest) => void }) {
  const prefs = form.preferences;

  const patch = (partial: Partial<NonNullable<RunPlanRequest["preferences"]>>) =>
    onChange({ ...form, preferences: { ...prefs, ...partial } });

  return (
    <fieldset className="border-none p-0 m-0">
      <div className="grid gap-x-4 gap-y-6 grid-cols-2">
        <label className="flex flex-col gap-2 overflow-hidden">
          <span className="text-sm font-bold text-secondary uppercase tracking-wider whitespace-nowrap truncate">配速(分/km)</span>
          <input className="n-input bg-surface/20 backdrop-blur-md border-white/10 hover:border-white/20 focus:bg-surface/40 focus:border-accent-green" type="number" step="0.1" value={prefs?.paceMinPerKm ?? 6.5} onChange={(e) => patch({ paceMinPerKm: Number(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-2 overflow-hidden">
          <span className="text-sm font-bold text-secondary uppercase tracking-wider whitespace-nowrap truncate">避开高 UV</span>
          <select className="n-input bg-surface/20 backdrop-blur-md border-white/10 hover:border-white/20 focus:bg-surface/40 focus:border-accent-green" value={String(prefs?.avoidHighUv ?? true)} onChange={(e) => patch({ avoidHighUv: e.target.value === "true" })}>
            <option value="true">是</option>
            <option value="false">否</option>
          </select>
        </label>
        <label className="flex flex-col gap-2 overflow-hidden">
          <span className="text-sm font-bold text-secondary uppercase tracking-wider whitespace-nowrap truncate">最短距离(km)</span>
          <input
            className="n-input bg-surface/20 backdrop-blur-md border-white/10 hover:border-white/20 focus:bg-surface/40 focus:border-accent-green"
            type="number"
            step="0.5"
            value={prefs?.preferredDistanceKm?.min ?? 4}
            onChange={(e) => patch({ preferredDistanceKm: { min: Number(e.target.value), max: prefs?.preferredDistanceKm?.max ?? 8 } })}
          />
        </label>
        <label className="flex flex-col gap-2 overflow-hidden">
          <span className="text-sm font-bold text-secondary uppercase tracking-wider whitespace-nowrap truncate">最长距离(km)</span>
          <input
            className="n-input bg-surface/20 backdrop-blur-md border-white/10 hover:border-white/20 focus:bg-surface/40 focus:border-accent-green"
            type="number"
            step="0.5"
            value={prefs?.preferredDistanceKm?.max ?? 8}
            onChange={(e) => patch({ preferredDistanceKm: { min: prefs?.preferredDistanceKm?.min ?? 4, max: Number(e.target.value) } })}
          />
        </label>
        <label className="flex flex-col gap-2 overflow-hidden">
          <span className="text-sm font-bold text-secondary uppercase tracking-wider whitespace-nowrap truncate">最早出发</span>
          <input className="n-input bg-surface/20 backdrop-blur-md border-white/10 hover:border-white/20 focus:bg-surface/40 focus:border-accent-green" type="time" value={prefs?.startWindow?.from ?? "06:00"} onChange={(e) => patch({ startWindow: { from: e.target.value, to: prefs?.startWindow?.to ?? "09:30" } })} />
        </label>
        <label className="flex flex-col gap-2 overflow-hidden">
          <span className="text-sm font-bold text-secondary uppercase tracking-wider whitespace-nowrap truncate">最晚出发</span>
          <input className="n-input bg-surface/20 backdrop-blur-md border-white/10 hover:border-white/20 focus:bg-surface/40 focus:border-accent-green" type="time" value={prefs?.startWindow?.to ?? "09:30"} onChange={(e) => patch({ startWindow: { from: prefs?.startWindow?.from ?? "06:00", to: e.target.value } })} />
        </label>
      </div>

      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-8"></div>
      <div>
        <div className="text-secondary text-sm font-bold uppercase tracking-wider mb-5">偏好地形</div>
        <div className="flex flex-wrap gap-2.5">
          {runTerrains.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`n-toggle px-4 py-2 flex items-center gap-2 text-sm font-bold transition-all backdrop-blur-md rounded-full ${prefs?.terrain?.includes(t.value) ? "bg-accent-green/20 text-accent-green border-accent-green/50 shadow-[0_0_12px_rgba(15,123,108,0.3)]" : "bg-surface/20 text-secondary border-white/10 hover:bg-surface/40 hover:text-primary"}`}
              aria-pressed={prefs?.terrain?.includes(t.value) ?? false}
              onClick={() => patch({ terrain: toggleInArray(prefs?.terrain, t.value) })}
            >
              <Icon icon={t.icon} className="text-lg opacity-80" />
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

/* ── Photo preferences form ── */

function PhotoPreferencesFields({ form, onChange }: { form: PhotoWeekRequest; onChange: (next: PhotoWeekRequest) => void }) {
  const prefs = form.preferences;

  const patch = (partial: Partial<NonNullable<PhotoWeekRequest["preferences"]>>) =>
    onChange({ ...form, preferences: { ...prefs, ...partial } });

  return (
    <fieldset className="border-none p-0 m-0">
      <div className="grid gap-x-6 gap-y-8 grid-cols-2">
        <label className="flex flex-col gap-4 overflow-hidden col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-secondary uppercase tracking-wider truncate">活动半径</span>
            <span className="text-primary font-mono font-bold text-sm bg-white/5 px-2 py-0.5 rounded shadow-sm border border-white/5">{prefs?.mobilityRadiusKm ?? 12} km</span>
          </div>
          <input className="w-full h-1.5 bg-surface/30 rounded-lg appearance-none cursor-pointer" style={{ accentColor: "var(--color-accent-pink)" }} type="range" min="1" max="50" step="1" value={prefs?.mobilityRadiusKm ?? 12} onChange={(e) => patch({ mobilityRadiusKm: Number(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-4 overflow-hidden col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-secondary uppercase tracking-wider truncate">摄影水平</span>
            <span className="text-primary font-mono font-bold text-sm bg-white/5 px-2 py-0.5 rounded shadow-sm border border-white/5">{cameraSkills.find(s => s.value === (prefs?.cameraSkill ?? "beginner"))?.label}</span>
          </div>
          <input className="w-full h-1.5 bg-surface/30 rounded-lg appearance-none cursor-pointer" style={{ accentColor: "var(--color-accent-pink)" }} type="range" min="0" max="2" step="1" value={cameraSkills.findIndex(s => s.value === (prefs?.cameraSkill ?? "beginner"))} onChange={(e) => patch({ cameraSkill: cameraSkills[Number(e.target.value)]?.value as CameraSkill || "beginner" })} />
          <div className="flex justify-between w-full px-1 text-[11px] text-tertiary font-bold tracking-widest mt-1">
            <span>新手</span>
            <span>进阶</span>
            <span>高级</span>
          </div>
        </label>
      </div>

      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-8"></div>
      <div>
        <div className="text-secondary text-sm font-bold uppercase tracking-wider mb-5">偏好题材</div>
        <div className="flex flex-wrap gap-2.5">
          {photoThemes.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`n-toggle px-4 py-2 flex items-center gap-2 text-sm font-bold transition-all backdrop-blur-md rounded-full ${prefs?.themes?.includes(t.value) ? "bg-accent-pink/20 text-accent-pink border-accent-pink/50 shadow-[0_0_12px_rgba(173,26,114,0.3)]" : "bg-surface/20 text-secondary border-white/10 hover:bg-surface/40 hover:text-primary"}`}
              aria-pressed={prefs?.themes?.includes(t.value) ?? false}
              onClick={() => patch({ themes: toggleInArray(prefs?.themes, t.value) })}
            >
              <Icon icon={t.icon} className="text-lg opacity-80" />
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

/* ── Composed section ── */

export function FormSection({ scenarioId, themeMode, runForm, photoForm, onRunChange, onPhotoChange, geoStatus, onRelocate }: FormSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const location = scenarioId === "run_tomorrow" ? runForm.location : photoForm.location;

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const circleRef = useRef<any>(null);

  const activeRadiusMeter = scenarioId === "photo_week"
    ? (photoForm.preferences?.mobilityRadiusKm ?? 12) * 1000
    : (runForm.preferences?.preferredDistanceKm?.max ?? 8) * 500;

  useEffect(() => {
    (window as any)._AMapSecurityConfig = {
      securityJsCode: import.meta.env.VITE_AMAP_SECURITY_CODE || "",
    };
    AMapLoader.load({
      key: import.meta.env.VITE_AMAP_JS_KEY || "2d201c10d7a04910ea0f05fbc316f728",
      version: "2.0",
      plugins: ["AMap.Scale", "AMap.ToolBar", "AMap.Circle"],
    }).then((AMap) => {
      if (!mapContainer.current) return;
      const map = new AMap.Map(mapContainer.current, {
        viewMode: "3D",
        zoom: scenarioId === "photo_week" ? 11 : 13.5,
        pitch: 15,
        rotation: -15,
        center: [location.longitude, location.latitude],
        mapStyle: themeMode === "dark" ? "amap://styles/dark" : "amap://styles/whitesmoke",
      });

      mapRef.current = map;

      new AMap.Marker({
        position: [location.longitude, location.latitude],
        map: map,
        content: `<div class="bg-surface backdrop-blur-md rounded-full w-8 h-8 flex items-center justify-center text-lg shadow-[0_0_24px_rgba(0,0,0,0.5)] border-2 border-primary animate-pulse">🎯</div>`,
        offset: new AMap.Pixel(-16, -16)
      });

      const circle = new AMap.Circle({
        center: [location.longitude, location.latitude],
        radius: activeRadiusMeter,
        strokeColor: "#525df3",
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: "#525df3",
        fillOpacity: 0.1,
        strokeStyle: "dashed",
        strokeDasharray: [10, 10],
      });
      circle.setMap(map);
      circleRef.current = circle;

    }).catch(e => {
      console.warn("AMap Loading failed. Ensure VITE_AMAP_JS_KEY is set.", e);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, []); // Run once on mount

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.panTo([location.longitude, location.latitude]);
      if (circleRef.current) {
        circleRef.current.setCenter([location.longitude, location.latitude]);
      }
    }
  }, [location.longitude, location.latitude]);

  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(activeRadiusMeter);
    }
  }, [activeRadiusMeter]);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setMapStyle(themeMode === "dark" ? "amap://styles/dark" : "amap://styles/whitesmoke");
    }
  }, [themeMode]);

  return (
    <div className="w-full h-full rounded-2xl overflow-hidden border border-white/5 bg-surface/10 shadow-sm relative group flex flex-col isolate" style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)", transform: "translateZ(0)" }}>
      {/* 3D Map Container Layer */}
      <div ref={mapContainer} className="absolute inset-0 z-0 bg-surface-gray"></div>

      {/* Decorative Grid Layer */}
      <div className="absolute inset-0 z-[1] pointer-events-none opacity-[0.08]" style={{ backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)", backgroundSize: "16px 16px" }}></div>

      {/* UI Overlay Layer */}
      <div className="relative z-10 flex flex-col h-full pointer-events-none">

        {/* Floating Settings Panel */}
        <div className="mt-auto pointer-events-auto w-full flex flex-col group/settings shadow-[0_-8px_32px_rgba(0,0,0,0.2)]">
          <div className={`relative transition-all duration-300 ease-in-out overflow-hidden z-20 ${isExpanded ? "opacity-100 max-h-[1200px]" : "opacity-0 max-h-0"}`}>
            <div className="p-6 sm:px-8 sm:py-6 bg-surface/80 backdrop-blur-3xl">
              {scenarioId === "run_tomorrow"
                ? <RunPreferencesFields form={runForm} onChange={onRunChange} />
                : <PhotoPreferencesFields form={photoForm} onChange={onPhotoChange} />}
            </div>
          </div>

          <div className="relative z-10 p-5 sm:px-8 sm:py-5 bg-surface/60 backdrop-blur-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 border-t border-white/10">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-accent-indigo/10 flex items-center justify-center text-accent-indigo ring-1 ring-accent-indigo/20 shadow-inner shrink-0">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.242-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="font-semibold text-base text-primary tracking-tight">{geoStatus === "detecting" ? "正在精准感知环境…" : (location.label || "未知坐标区域")}</div>
                <div className="flex items-center">
                  <span className="text-tertiary text-[11px] uppercase tracking-widest font-mono bg-white/5 px-2 py-0.5 rounded border border-white/5 inline-block">
                    {location.latitude.toFixed(4)}°N, {location.longitude.toFixed(4)}°E
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-3 w-full sm:w-auto mt-2 sm:mt-0 items-center justify-end">
              <button type="button" onClick={onRelocate} disabled={geoStatus === "detecting"} className="w-10 h-10 shrink-0 bg-surface/50 hover:bg-surface border border-white/5 rounded-full text-secondary hover:text-primary transition-all flex items-center justify-center shadow-sm" aria-label="重新定位" title="重新定位">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={geoStatus === "detecting" ? "animate-spin text-primary" : ""}><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.27l5.67-5.67"/></svg>
              </button>
              <button type="button" onClick={() => setIsExpanded(!isExpanded)} className="px-5 py-2.5 text-sm font-bold bg-primary hover:opacity-90 rounded-full transition-all shadow-md flex items-center justify-center gap-2 border border-transparent hover:scale-[1.02]" style={{ color: "var(--color-base-bg)" }}>
                偏好 <Icon icon="lucide:chevron-up" className={`text-[1.2rem] transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
