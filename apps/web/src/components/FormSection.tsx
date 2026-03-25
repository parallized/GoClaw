import type { CameraSkill, PhotoTheme, RunTerrain, ScenarioId } from "@goplan/contracts";
import type { PhotoWeekRequest, RunPlanRequest } from "@goplan/contracts";

interface FormSectionProps {
  scenarioId: ScenarioId;
  runForm: RunPlanRequest;
  photoForm: PhotoWeekRequest;
  onRunChange: (next: RunPlanRequest) => void;
  onPhotoChange: (next: PhotoWeekRequest) => void;
  geoStatus: "idle" | "detecting" | "done" | "failed";
  onRelocate: () => void;
}

/* ── Data ── */

const runTerrains: Array<{ value: RunTerrain; label: string }> = [
  { value: "park", label: "公园" },
  { value: "shaded", label: "树荫" },
  { value: "flat", label: "平路" },
  { value: "waterfront", label: "临水" },
  { value: "track", label: "田径场" },
];

const photoThemes: Array<{ value: PhotoTheme; label: string }> = [
  { value: "nature", label: "自然" },
  { value: "architecture", label: "建筑" },
  { value: "humanity", label: "人文" },
  { value: "urban", label: "城市" },
  { value: "night", label: "夜景" },
  { value: "waterfront", label: "水边" },
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
      <div className="flex flex-col gap-4 rounded-xl border border-solid border-white/5 p-5 bg-surface/30 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] transition-all hover:bg-surface/40">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5 overflow-hidden">
            <div className="font-bold text-lg text-primary leading-tight truncate">
              {geoStatus === "detecting" ? "正在精准定位…" : (label || "默认位置")}
            </div>
            <div className="text-secondary tracking-wide text-[10px] font-bold font-mono uppercase opacity-70">
              {latitude.toFixed(4)}°N, {longitude.toFixed(4)}°E
            </div>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg bg-primary text-base-bg border-none py-2 px-3 sm:px-4 text-[10px] sm:text-xs font-bold cursor-pointer transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 uppercase tracking-widest shadow-md"
            onClick={onRelocate}
            disabled={geoStatus === "detecting"}
          >
            {geoStatus === "detecting" ? "定位中" : "重新定位"}
          </button>
        </div>
        {geoStatus === "failed" && (
          <div className="text-xs mt-1 flex items-center gap-2 text-error-text font-bold bg-error-bg/50 backdrop-blur-sm p-3 rounded-lg border border-solid border-error-border">
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
      <legend className="mb-6 text-[10px] font-bold uppercase tracking-widest text-accent-green flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-green shadow-[0_0_8px_rgba(15,123,108,0.6)]"></span> 跑步偏好
      </legend>
      <div className="grid gap-x-4 gap-y-6 grid-cols-2">
        <label className="flex flex-col gap-2 overflow-hidden">
          <span className="text-[11px] font-bold text-secondary uppercase tracking-wider whitespace-nowrap truncate">配速(分/km)</span>
          <input className="n-input bg-surface/20 backdrop-blur-md border-white/10 hover:border-white/20 focus:bg-surface/40 focus:border-accent-green" type="number" step="0.1" value={prefs?.paceMinPerKm ?? 6.5} onChange={(e) => patch({ paceMinPerKm: Number(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-2 overflow-hidden">
          <span className="text-[11px] font-bold text-secondary uppercase tracking-wider whitespace-nowrap truncate">避开高 UV</span>
          <select className="n-input bg-surface/20 backdrop-blur-md border-white/10 hover:border-white/20 focus:bg-surface/40 focus:border-accent-green" value={String(prefs?.avoidHighUv ?? true)} onChange={(e) => patch({ avoidHighUv: e.target.value === "true" })}>
            <option value="true">是</option>
            <option value="false">否</option>
          </select>
        </label>
        <label className="flex flex-col gap-2 overflow-hidden">
          <span className="text-[11px] font-bold text-secondary uppercase tracking-wider whitespace-nowrap truncate">最短距离(km)</span>
          <input
            className="n-input bg-surface/20 backdrop-blur-md border-white/10 hover:border-white/20 focus:bg-surface/40 focus:border-accent-green"
            type="number"
            step="0.5"
            value={prefs?.preferredDistanceKm?.min ?? 4}
            onChange={(e) => patch({ preferredDistanceKm: { min: Number(e.target.value), max: prefs?.preferredDistanceKm?.max ?? 8 } })}
          />
        </label>
        <label className="flex flex-col gap-2 overflow-hidden">
          <span className="text-[11px] font-bold text-secondary uppercase tracking-wider whitespace-nowrap truncate">最长距离(km)</span>
          <input
            className="n-input bg-surface/20 backdrop-blur-md border-white/10 hover:border-white/20 focus:bg-surface/40 focus:border-accent-green"
            type="number"
            step="0.5"
            value={prefs?.preferredDistanceKm?.max ?? 8}
            onChange={(e) => patch({ preferredDistanceKm: { min: prefs?.preferredDistanceKm?.min ?? 4, max: Number(e.target.value) } })}
          />
        </label>
        <label className="flex flex-col gap-2 overflow-hidden">
          <span className="text-[11px] font-bold text-secondary uppercase tracking-wider whitespace-nowrap truncate">最早出发</span>
          <input className="n-input bg-surface/20 backdrop-blur-md border-white/10 hover:border-white/20 focus:bg-surface/40 focus:border-accent-green" type="time" value={prefs?.startWindow?.from ?? "06:00"} onChange={(e) => patch({ startWindow: { from: e.target.value, to: prefs?.startWindow?.to ?? "09:30" } })} />
        </label>
        <label className="flex flex-col gap-2 overflow-hidden">
          <span className="text-[11px] font-bold text-secondary uppercase tracking-wider whitespace-nowrap truncate">最晚出发</span>
          <input className="n-input bg-surface/20 backdrop-blur-md border-white/10 hover:border-white/20 focus:bg-surface/40 focus:border-accent-green" type="time" value={prefs?.startWindow?.to ?? "09:30"} onChange={(e) => patch({ startWindow: { from: prefs?.startWindow?.from ?? "06:00", to: e.target.value } })} />
        </label>
      </div>

      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-8"></div>
      <div>
        <div className="text-secondary text-[11px] font-bold uppercase tracking-wider mb-5">偏好地形</div>
        <div className="flex flex-wrap gap-2.5">
          {runTerrains.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`n-toggle px-4 py-1.5 text-xs font-bold transition-all backdrop-blur-md rounded-full ${prefs?.terrain?.includes(t.value) ? "bg-accent-green/20 text-accent-green border-accent-green/50 shadow-[0_0_12px_rgba(15,123,108,0.3)]" : "bg-surface/20 text-secondary border-white/10 hover:bg-surface/40 hover:text-primary"}`}
              aria-pressed={prefs?.terrain?.includes(t.value) ?? false}
              onClick={() => patch({ terrain: toggleInArray(prefs?.terrain, t.value) })}
            >
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
      <legend className="mb-6 text-[10px] font-bold uppercase tracking-widest text-accent-pink flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-pink shadow-[0_0_8px_rgba(173,26,114,0.6)]"></span> 拍照偏好
      </legend>
      <div className="grid gap-x-4 gap-y-6 grid-cols-2">
        <label className="flex flex-col gap-2 overflow-hidden">
          <span className="text-[11px] font-bold text-secondary uppercase tracking-wider whitespace-nowrap truncate">活动半径(km)</span>
          <input className="n-input bg-surface/20 backdrop-blur-md border-white/10 hover:border-white/20 focus:bg-surface/40 focus:border-accent-pink" type="number" step="1" value={prefs?.mobilityRadiusKm ?? 12} onChange={(e) => patch({ mobilityRadiusKm: Number(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-2 overflow-hidden">
          <span className="text-[11px] font-bold text-secondary uppercase tracking-wider whitespace-nowrap truncate">摄影水平</span>
          <select className="n-input bg-surface/20 backdrop-blur-md border-white/10 hover:border-white/20 focus:bg-surface/40 focus:border-accent-pink" value={prefs?.cameraSkill ?? "beginner"} onChange={(e) => patch({ cameraSkill: e.target.value as CameraSkill })}>
            {cameraSkills.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-8"></div>
      <div>
        <div className="text-secondary text-[11px] font-bold uppercase tracking-wider mb-5">偏好题材</div>
        <div className="flex flex-wrap gap-2.5">
          {photoThemes.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`n-toggle px-4 py-1.5 text-xs font-bold transition-all backdrop-blur-md rounded-full ${prefs?.themes?.includes(t.value) ? "bg-accent-pink/20 text-accent-pink border-accent-pink/50 shadow-[0_0_12px_rgba(173,26,114,0.3)]" : "bg-surface/20 text-secondary border-white/10 hover:bg-surface/40 hover:text-primary"}`}
              aria-pressed={prefs?.themes?.includes(t.value) ?? false}
              onClick={() => patch({ themes: toggleInArray(prefs?.themes, t.value) })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

/* ── Composed section ── */

export function FormSection({ scenarioId, runForm, photoForm, onRunChange, onPhotoChange, geoStatus, onRelocate }: FormSectionProps) {
  const location = scenarioId === "run_tomorrow" ? runForm.location : photoForm.location;

  return (
    <div>
      <h2 className="mb-2 text-2xl font-bold tracking-tight text-primary">参数设置</h2>
      <p className="text-tertiary mb-10 text-xs font-bold uppercase tracking-widest">位置自动获取，偏好自主掌握</p>

      <LocationDisplay
        label={location.label}
        latitude={location.latitude}
        longitude={location.longitude}
        geoStatus={geoStatus}
        onRelocate={onRelocate}
      />

      {scenarioId === "run_tomorrow"
        ? <RunPreferencesFields form={runForm} onChange={onRunChange} />
        : <PhotoPreferencesFields form={photoForm} onChange={onPhotoChange} />}
    </div>
  );
}
