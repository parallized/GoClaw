import { useEffect, useId, useRef, useState } from "react";
import AMapLoader from "@amap/amap-jsapi-loader";
import { Icon } from "@iconify/react";
import type { CameraSkill, PhotoTheme, RunTerrain, ScenarioId, PlanResult } from "@goclaw/contracts";
import type { PhotoWeekRequest, RunPlanRequest } from "@goclaw/contracts";
import type { ReservationTarget } from "./NavigationStack";

export function getTagColorClass(value: string) {
  switch (value) {
    case "park":
    case "shaded":
    case "nature":
    case "waterfront":
      return "map-tag--sage";
    case "flat":
    case "urban":
    case "architecture":
    case "humanity":
    case "night":
      return "map-tag--cyan";
    case "track":
      return "map-tag--gold";
    default:
      return "map-tag--slate";
  }
}

export function getTagColorHex(value: string) {
  switch (value) {
    case "park":
    case "shaded":
    case "nature":
      return "#10b981"; // emerald green
    case "flat":
    case "urban":
      return "#64748b"; // slate
    case "architecture":
      return "#3b82f6"; // bright blue
    case "waterfront":
      return "#06b6d4"; // cyan/teal
    case "humanity":
      return "#6366f1"; // indigo
    case "track":
      return "#f59e0b"; // amber/orange
    case "night":
      return "#818cf8"; // soft indigo
    default:
      return "#64748b"; // slate
  }
}

export interface FormSectionProps {
  scenarioId: ScenarioId;
  themeMode: "light" | "dark";
  runForm: RunPlanRequest;
  photoForm: PhotoWeekRequest;
  onRunChange: (next: RunPlanRequest) => void;
  onPhotoChange: (next: PhotoWeekRequest) => void;
  geoStatus: "idle" | "detecting" | "done" | "failed";
  onRelocate: () => void;
  isGenerating?: boolean;
  currentWeather?: string;
  poiCandidates?: any[];
  result?: PlanResult | null;
  onNavigate?: (target?: ReservationTarget) => void;
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

function openTimeInput(input: HTMLInputElement | null) {
  if (!input) return;
  try {
    input.showPicker();
  } catch (err) {
    input.focus();
  }
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
        <div className="absolute w-full h-1 bg-black/20 dark:bg-white/10 rounded-full top-1"></div>
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

export function RunDistanceControl({ max, onChange }: { max: number; onChange: (val: number) => void }) {
  return (
    <div className="absolute top-4 right-4 z-20 bg-surface/40 backdrop-blur-md p-3 rounded-xl border border-white/5 w-40 animate-in fade-in slide-in-from-right-4 duration-500 pointer-events-auto shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] text-tertiary uppercase tracking-widest">距离范围</span>
        <span className="text-primary font-bold text-xs">{max} km</span>
      </div>
      <div className="relative w-full h-4 pt-1">
        <div className="absolute w-full h-1 bg-black/20 dark:bg-white/10 rounded-full top-1"></div>
        <input
          className="absolute w-full h-1 appearance-none bg-transparent cursor-pointer z-10 top-1"
          style={{ accentColor: "var(--color-accent-blue)" }}
          type="range" min="0.5" max="21" step="0.1" value={max}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

function timeStrToHour(s: string) {
  const part = s.split(":")[0];
  return part ? parseInt(part) : 0;
}
function hourToTimeStr(h: number) {
  return `${h.toString().padStart(2, "0")}:00`;
}

export function TimeWindowControl({ from, to, onChange, colors }: { from: string; to: string; onChange: (from: string, to: string) => void, colors?: string[] }) {
  const fH = timeStrToHour(from);
  const tH = timeStrToHour(to);

  const gradient = colors && colors.length > 0
    ? (colors.length === 1
      ? colors[0]
      : `linear-gradient(to right, ${colors.join(", ")})`)
    : "var(--color-accent-green)";

  return (
    <div className="flex flex-col bg-surface/20 rounded-xl px-4 py-2 border border-white/10 shadow-sm min-w-[200px]">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[12px] text-tertiary uppercase tracking-widest">时间安排</span>
        <span className="text-primary text-[12px]">{timeStrToHour(from)} 点出发，{timeStrToHour(to)} 点回来</span>
      </div>
      <div className="relative w-full h-4 pt-1">
        <div className="absolute w-full h-1 bg-black/20 dark:bg-white/10 rounded-full top-1"></div>
        <div
          className="absolute h-1 rounded-full top-1 z-10 transition-all duration-300"
          style={{
            left: `${(fH / 24) * 100}%`,
            width: `${((tH - fH) / 24) * 100}%`,
            background: gradient
          }}
        ></div>
        <input
          type="range" min="0" max="24" step="1" value={fH}
          onChange={(e) => onChange(hourToTimeStr(Math.min(Number(e.target.value), tH - 1)), to)}
          className="range-input absolute w-full h-1 appearance-none bg-transparent pointer-events-auto z-30 top-1"
          style={{ accentColor: "white" }}
        />
        <input
          type="range" min="0" max="24" step="1" value={tH}
          onChange={(e) => onChange(from, hourToTimeStr(Math.max(Number(e.target.value), fH + 1)))}
          className="range-input absolute w-full h-1 appearance-none bg-transparent pointer-events-auto z-40 top-1"
          style={{ accentColor: "white" }}
        />
      </div>
    </div>
  );
}

export function TerrainControl({ selected, onChange }: { selected: string[]; onChange: (val: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {runTerrains.map((t) => {
        const tagClass = getTagColorClass(t.value);
        return (
          <button
            key={t.value}
            type="button"
            className={`map-tag ${tagClass} ${selected.includes(t.value) ? "map-tag--active" : ""}`}
            onClick={() => onChange(toggleInArray(selected, t.value))}
          >
            <Icon icon={t.icon} className="text-base" />
            {t.label}
          </button>
        );
      })}
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
        <div className="absolute w-full h-1 bg-black/20 dark:bg-white/10 rounded-full top-1"></div>
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
        <div className="absolute w-[calc(100%-2rem)] h-1 bg-black/20 dark:bg-white/10 rounded-full"></div>
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
      {photoThemes.map((t) => {
        const tagClass = getTagColorClass(t.value);
        return (
          <button
            key={t.value}
            type="button"
            className={`map-tag ${tagClass} ${selected.includes(t.value) ? "map-tag--active" : ""}`}
            onClick={() => onChange(toggleInArray(selected, t.value))}
          >
            <Icon icon={t.icon} className="text-base" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Composed section ── */

export function FormSection({ scenarioId, themeMode, runForm, photoForm, onRunChange, onPhotoChange, geoStatus, onRelocate, isGenerating, currentWeather, poiCandidates, result, onNavigate }: FormSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const location = scenarioId === "run_tomorrow" ? runForm.location : photoForm.location;

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const poiMarkersRef = useRef<Map<string, any>>(new Map());
  const infoWindowRef = useRef<any>(null);
  const routingPluginRef = useRef<any>(null);

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
        strokeColor: "#22d3ee", // cyan accent
        strokeOpacity: 0.6,
        strokeWeight: 2,
        fillColor: "#22d3ee",
        fillOpacity: 0.08,
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

  function drawRoute(from: {longitude: number, latitude: number}, to: {longitude: number, latitude: number}) {
     if (!mapRef.current) return;
     if (infoWindowRef.current) infoWindowRef.current.close();
     
     (window as any).AMap.plugin('AMap.Walking', () => {
        if (!routingPluginRef.current) {
           routingPluginRef.current = new (window as any).AMap.Walking({
              map: mapRef.current,
              hideMarkers: true,
              autoFitView: true,
           });
        }
        routingPluginRef.current.clear();
        routingPluginRef.current.search([from.longitude, from.latitude], [to.longitude, to.latitude]);
     });
  }

  useEffect(() => {
    if (!mapRef.current) return;
    
    // figure out which are final selected routes/spots if exist
    const selectedPois = new Map<string, any>();
    if (result) {
       if (result.type === "run_tomorrow") {
          result.routes.forEach((r: any) => selectedPois.set(r.name, r));
       } else if (result.type === "photo_week") {
          result.days.forEach((d: any) => d.spots.forEach((s: any) => selectedPois.set(s.name, s)));
       }
    }

    const currentCandidates = poiCandidates || [];
    const newMarkersMap = new Map<string, any>();
    const currentNames = new Set(currentCandidates.map((c: any) => c.name));

    for (const [name, marker] of poiMarkersRef.current.entries()) {
      if (!currentNames.has(name) || (result && !selectedPois.has(name))) {
         if (result) {
            marker.setContent(`<div class="bg-surface/30 backdrop-blur-sm rounded-full w-3 h-3 shadow-sm border border-white/10 transition-all opacity-30"></div>`);
            newMarkersMap.set(name, marker);
         } else {
            mapRef.current.remove(marker);
         }
      }
    }

    currentCandidates.forEach((candidate: any) => {
      const isSelected = result && selectedPois.has(candidate.name);
      const isFaded = result && !isSelected;
      
      let markerHtml = "";
      if (isSelected) {
         markerHtml = `<div class="bg-surface/80 backdrop-blur-md rounded-full px-3 py-1 shadow-lg border border-primary/30 text-[11px] font-bold text-primary pointer-events-auto transition-transform hover:scale-105 flex items-center gap-1"><span class="text-xs">✨</span> ${candidate.name}</div>`;
      } else if (isFaded) {
         markerHtml = `<div class="bg-surface/30 backdrop-blur-sm rounded-full w-3 h-3 shadow-sm border border-white/10 opacity-30 transition-all"></div>`;
      } else {
         markerHtml = `<div class="bg-surface backdrop-blur-md rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-sm border border-primary/30 relative">
            ${isGenerating ? '<div class="absolute inset-0 rounded-full border-t border-primary animate-spin"></div>' : ''}
            <div class="w-1.5 h-1.5 rounded-full bg-primary/80"></div>
         </div>`;
      }

      let marker = poiMarkersRef.current.get(candidate.name);
      if (marker && (!result || isSelected || isFaded)) {
         marker.setContent(markerHtml);
      } else if (!marker) {
         marker = new (window as any).AMap.Marker({
            position: [candidate.coordinates.longitude, candidate.coordinates.latitude],
            map: mapRef.current,
            content: markerHtml,
            offset: isSelected ? new (window as any).AMap.Pixel(-30, -10) : new (window as any).AMap.Pixel(-10, -10),
            zIndex: isSelected ? 100 : 50,
         });
         
         marker.on('click', () => {
             if (result && selectedPois.has(candidate.name)) {
                 const selectedData = selectedPois.get(candidate.name);
                 const contentDiv = document.createElement("div");
                 contentDiv.className = "bg-surface/95 backdrop-blur-2xl rounded-2xl p-4 shadow-[0_16px_48px_rgba(0,0,0,0.6)] border border-primary/20 flex flex-col gap-2 w-64 pointer-events-auto";
                 contentDiv.innerHTML = `
                    <div class="font-bold text-base text-primary">${candidate.name}</div>
                    <div class="flex gap-1 flex-wrap mt-1">${(candidate.tags || candidate.themes || candidate.terrains || []).map((t: string) => `<span class="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-secondary border border-white/5">${t}</span>`).join('')}</div>
                    <div class="text-xs text-secondary mt-1 leading-relaxed">${selectedData.why || selectedData.tip || selectedData.reason || ''}</div>
                    <button id="amap-route-btn" class="mt-3 w-full py-2.5 bg-primary text-base-bg font-bold rounded-xl text-sm transition-opacity cursor-pointer hover:opacity-90">在地图上寻路</button>
                    ${selectedData.navigationUrl ? `<a href="${selectedData.navigationUrl}" target="_blank" class="mt-1 w-full py-2 text-center text-tertiary text-xs hover:text-primary transition-colors">打开第三方导航</a>` : ''}
                 `;
                 
                 contentDiv.querySelector("#amap-route-btn")?.addEventListener("click", () => {
                     drawRoute(location, candidate.coordinates);
                 });

                 if (!infoWindowRef.current) {
                    infoWindowRef.current = new (window as any).AMap.InfoWindow({
                       isCustom: true,
                       autoMove: true,
                       offset: new (window as any).AMap.Pixel(0, -10)
                    });
                 }
                 infoWindowRef.current.setContent(contentDiv);
                 infoWindowRef.current.open(mapRef.current, [candidate.coordinates.longitude, candidate.coordinates.latitude]);
             }
         });
      }
      newMarkersMap.set(candidate.name, marker);
    });

    poiMarkersRef.current = newMarkersMap;

  }, [poiCandidates, isGenerating, result]);

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
      <div className="relative z-10 flex flex-col h-full pointer-events-none p-4">

        {currentWeather && (
           <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto bg-surface/60 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10 shadow-lg text-primary text-xs font-medium animate-fade-in whitespace-nowrap">
             {currentWeather}
           </div>
        )}

        {/* Scenario-specific Floating MAP Tools */}
          {scenarioId === "run_tomorrow" ? (
            <>
              <RunDistanceControl
                max={runForm.preferences?.preferredDistanceKm?.max ?? 8}
                onChange={(val) => onRunChange({ ...runForm, preferences: { ...runForm.preferences, preferredDistanceKm: { min: 1, max: val } } })}
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
              <div className="text-[12px] text-primary tracking-tight truncate max-w-[200px]">
                {geoStatus === "detecting" ? "正在推算位置..." : (location.label || "观测区域已锁定")}
              </div>
              <div className="h-3 w-px bg-neutral-500/30"></div>
              <button
                type="button"
                aria-label="重新获取我的位置"
                onClick={onRelocate}
                disabled={geoStatus === "detecting"}
                className="bg-transparent border-0 p-0 text-[12px] text-tertiary hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-tighter cursor-pointer"
              >
                {geoStatus === "detecting" ? <Icon icon="lucide:refresh-cw" className="animate-spin text-xs" /> : "我的位置"}
              </button>
            </div>
          </div>
        </div>
      </div>
  );
}
