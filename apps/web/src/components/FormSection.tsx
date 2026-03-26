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

/* ── Run preferences form components ── */

export function RunPaceControl({ paceMinPerKm, onChange }: { paceMinPerKm: number; onChange: (val: number) => void }) {
  return (
    <div className="absolute top-4 left-4 z-20 bg-surface/40 backdrop-blur-md p-3 rounded-xl border border-white/5 w-44 animate-in fade-in slide-in-from-left-4 duration-500 pointer-events-auto shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-tertiary uppercase tracking-widest">推荐配速</span>
        <span className="text-primary font-bold text-xs">{paceMinPerKm} 分/km</span>
      </div>
      <div className="relative w-full h-4 pt-1">
        <div className="absolute w-full h-1 bg-white/10 rounded-full top-1"></div>
        <input
          className="absolute w-full h-1 appearance-none bg-transparent cursor-pointer z-10 top-1"
          style={{ accentColor: "var(--color-accent-green)" }}
          type="range"
          min="3.0"
          max="10.0"
          step="0.1"
          value={paceMinPerKm}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

export function RunDistanceControl({ min, max, onChange }: { min: number; max: number; onChange: (min: number, max: number) => void }) {
  return (
    <div className="absolute top-4 right-4 z-20 bg-surface/40 backdrop-blur-md p-3 rounded-xl border border-white/5 w-40 animate-in fade-in slide-in-from-right-4 duration-500 pointer-events-auto shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-tertiary uppercase tracking-widest">距离范围</span>
        <span className="text-primary font-bold text-xs">
          {min} - {max} km
        </span>
      </div>
      <div className="relative w-full h-4 pt-1">
        <div className="absolute w-full h-1 bg-white/10 rounded-full top-1"></div>
        <div
          className="absolute h-1 bg-accent-blue rounded-full top-1 z-10"
          style={{
            left: `${(min - 1) / (21 - 1) * 100}%`,
            width: `${(max - min) / (21 - 1) * 100}%`
          }}
        ></div>
        <input
          type="range" min="1" max="21" step="0.5" value={min}
          onChange={(e) => onChange(Math.min(Number(e.target.value), max - 0.5), max)}
          className="range-input absolute w-full h-1 appearance-none bg-transparent pointer-events-auto z-30 top-1"
          style={{ accentColor: "var(--color-accent-blue)" }}
        />
        <input
          type="range" min="1" max="21" step="0.5" value={max}
          onChange={(e) => onChange(min, Math.max(Number(e.target.value), min + 0.5))}
          className="range-input absolute w-full h-1 appearance-none bg-transparent pointer-events-auto z-40 top-1"
          style={{ accentColor: "var(--color-accent-blue)" }}
        />
      </div>
      <div className="flex justify-between w-full px-1 text-[8px] text-tertiary font-bold tracking-tighter mt-1 opacity-50">
        <span>日常</span>
        <span>中距离</span>
        <span>半马</span>
      </div>
    </div>
  );
}

export function TimeWindowControl({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <div className="flex items-center gap-0 bg-surface/20 rounded-xl overflow-hidden border border-white/10 shadow-sm group-focus-within:border-accent-green/50 transition-all">
      <div className="flex-1 flex items-center relative gap-3 px-4 py-2 hover:bg-white/5 transition-colors">
        <span className="text-[11px] font-bold text-tertiary uppercase shrink-0">从</span>
        <Icon icon="lucide:clock-9" className="text-tertiary text-lg shrink-0" />
        <input
          className="w-full bg-transparent border-none p-0 text-primary text-sm font-bold focus:outline-none appearance-none cursor-pointer"
          type="time"
          value={from}
          onChange={(e) => onChange(e.target.value, to)}
        />
      </div>
      <div className="text-tertiary opacity-30 flex items-center px-1">
        <div className="w-3 h-px bg-current"></div>
      </div>
      <div className="flex-1 flex items-center relative gap-3 px-4 py-2 hover:bg-white/5 transition-colors">
        <span className="text-[11px] font-bold text-tertiary uppercase shrink-0">至</span>
        <Icon icon="lucide:clock-3" className="text-tertiary text-lg shrink-0" />
        <input
          className="w-full bg-transparent border-none p-0 text-primary text-sm font-bold focus:outline-none appearance-none cursor-pointer"
          type="time"
          value={to}
          onChange={(e) => onChange(from, e.target.value)}
        />
      </div>
    </div>
  );
}

export function TerrainControl({ selected, onChange }: { selected: string[]; onChange: (val: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {runTerrains.map((t) => (
        <button
          key={t.value}
          type="button"
          className={`n-toggle px-3 py-1.5 flex items-center gap-2 text-xs font-bold transition-all rounded-full ${selected?.includes(t.value) ? "bg-accent-green text-white shadow-lg" : "bg-surface/20 text-secondary border-white/5 hover:bg-surface/40 hover:text-primary"}`}
          onClick={() => onChange(toggleInArray(selected, t.value))}
        >
          <Icon icon={t.icon} className="text-base opacity-90" />
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ── Photo preferences form components ── */

export function PhotoMobilityControl({ radius, onChange }: { radius: number; onChange: (val: number) => void }) {
  return (
    <div className="absolute top-4 right-4 z-20 bg-surface/40 backdrop-blur-md p-3 rounded-xl border border-white/5 w-60 animate-in fade-in slide-in-from-right-4 duration-500 pointer-events-auto shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] text-tertiary uppercase tracking-widest">范围</span>
        <span className="text-primary font-bold text-xs">{radius} 千米</span>
      </div>
      <div className="relative w-full h-4 pt-1">
        <div className="absolute w-full h-1 bg-white/10 rounded-full top-1"></div>
        <input
          className="absolute w-full h-1 appearance-none bg-transparent cursor-pointer z-10 top-1"
          style={{ accentColor: "var(--color-accent-pink)" }}
          type="range" min="0.5" max="50" step="0.1" value={radius}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

export function PhotoSkillControl({ skill, onChange }: { skill: string; onChange: (val: CameraSkill) => void }) {
  return (
    <div className="flex items-center gap-0 bg-surface/20 rounded-xl overflow-hidden border border-white/10 shadow-sm transition-all h-12">
      <div className="px-4 py-2 border-r border-white/5 flex flex-col justify-center">
        <span className="text-[9px] font-bold text-tertiary uppercase tracking-tighter mb-0.5">摄影水平</span>
        <span className="text-primary font-bold text-xs">{cameraSkills.find(s => s.value === skill)?.label}</span>
      </div>
      <div className="flex-1 relative px-4 flex items-center">
        <div className="absolute w-[calc(100%-2rem)] h-1 bg-white/10 rounded-full"></div>
        <input
          className="relative w-full h-1 appearance-none bg-transparent cursor-pointer z-10"
          style={{ accentColor: "var(--color-accent-pink)" }}
          type="range" min="0" max="2" step="1"
          value={cameraSkills.findIndex(s => s.value === skill)}
          onChange={(e) => onChange(cameraSkills[Number(e.target.value)]?.value as CameraSkill)}
        />
      </div>
    </div>
  );
}

export function PhotoThemesControl({ selected, onChange }: { selected: string[]; onChange: (val: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {photoThemes.map((t) => (
        <button
          key={t.value}
          type="button"
          className={`n-toggle px-3 py-1.5 flex items-center gap-2 text-xs font-bold transition-all rounded-full ${selected?.includes(t.value) ? "bg-accent-pink text-white shadow-lg" : "bg-surface/20 text-secondary border-white/5 hover:bg-surface/40 hover:text-primary"}`}
          onClick={() => onChange(toggleInArray(selected, t.value))}
        >
          <Icon icon={t.icon} className="text-base opacity-90" />
          {t.label}
        </button>
      ))}
    </div>
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

        {/* UI Overlay Layer */}
        <div className="relative z-10 flex flex-col h-full pointer-events-none p-4">

          {/* Scenario-specific Floating MAP Tools */}
          {scenarioId === "run_tomorrow" ? (
            <>
              <RunPaceControl
                paceMinPerKm={runForm.preferences?.paceMinPerKm ?? 6.5}
                onChange={(val) => onRunChange({ ...runForm, preferences: { ...runForm.preferences, paceMinPerKm: val } })}
              />
              <RunDistanceControl
                min={runForm.preferences?.preferredDistanceKm?.min ?? 4}
                max={runForm.preferences?.preferredDistanceKm?.max ?? 8}
                onChange={(min, max) => onRunChange({ ...runForm, preferences: { ...runForm.preferences, preferredDistanceKm: { min, max } } })}
              />
            </>
          ) : (
            <>
              <PhotoMobilityControl
                radius={photoForm.preferences?.mobilityRadiusKm ?? 12}
                onChange={(val) => onPhotoChange({ ...photoForm, preferences: { ...photoForm.preferences, mobilityRadiusKm: val } })}
              />
            </>
          )}

          {/* Floating Location Badge */}
          <div className="mt-auto pointer-events-auto flex items-center justify-center w-full">
            <div className="bg-surface/80 backdrop-blur-lg px-4 py-2 rounded-full border border-white/10 shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className={`w-2 h-2 rounded-full ${geoStatus === "detecting" ? "bg-accent-indigo animate-pulse" : "bg-accent-green"}`}></div>
              <div className="text-[11px] font-bold text-primary tracking-tight truncate max-w-[200px]">
                {geoStatus === "detecting" ? "正在推算位置..." : (location.label || "观测区域已锁定")}
              </div>
              <div className="h-3 w-px bg-white/10"></div>
              <div
                onClick={onRelocate}
                className="text-[10px] font-bold text-tertiary hover:text-primary transition-colors disabled:opacity-30 uppercase tracking-tighter"
              >
                {geoStatus === "detecting" ? <Icon icon="lucide:refresh-cw" className="animate-spin text-xs" /> : "我的位置"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
