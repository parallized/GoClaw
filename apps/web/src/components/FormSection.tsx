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
    <fieldset className="mb-6">
      <legend className="mb-3 text-xs font-medium uppercase tracking-wider text-tertiary">位置</legend>
      <div className="flex items-center justify-between gap-4 rounded-2 border border-solid border-edge py-3 px-4 bg-surface-hover">
        <div className="flex flex-col gap-1">
          <div className="font-medium">
            {geoStatus === "detecting" ? "正在定位…" : (label || "北京")}
          </div>
          <div className="text-tertiary text-xs">
            {latitude.toFixed(4)}°N, {longitude.toFixed(4)}°E
          </div>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-1.5 border border-solid border-edge py-1.5 px-3 text-xs bg-surface text-accent-blue cursor-pointer transition-colors hover:bg-surface-hover disabled:text-tertiary disabled:cursor-not-allowed"
          onClick={onRelocate}
          disabled={geoStatus === "detecting"}
        >
          {geoStatus === "detecting" ? "定位中…" : "重新定位"}
        </button>
      </div>
      {geoStatus === "failed" && (
        <div className="text-xs mt-2 text-error-text">
          定位失败，使用默认位置。请允许浏览器定位权限后重试。
        </div>
      )}
    </fieldset>
  );
}

/* ── Run preferences form ── */

function RunPreferencesFields({ form, onChange }: { form: RunPlanRequest; onChange: (next: RunPlanRequest) => void }) {
  const prefs = form.preferences;

  const patch = (partial: Partial<NonNullable<RunPlanRequest["preferences"]>>) =>
    onChange({ ...form, preferences: { ...prefs, ...partial } });

  return (
    <fieldset>
      <legend className="mb-3 text-xs font-medium uppercase tracking-wider text-tertiary">跑步偏好</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-secondary">
          <div className="mb-1.5">配速（分钟/km）</div>
          <input className="n-input" type="number" step="0.1" value={prefs?.paceMinPerKm ?? 6.5} onChange={(e) => patch({ paceMinPerKm: Number(e.target.value) })} />
        </label>
        <label className="text-sm text-secondary">
          <div className="mb-1.5">避开高 UV</div>
          <select className="n-input" value={String(prefs?.avoidHighUv ?? true)} onChange={(e) => patch({ avoidHighUv: e.target.value === "true" })}>
            <option value="true">是</option>
            <option value="false">否</option>
          </select>
        </label>
        <label className="text-sm text-secondary">
          <div className="mb-1.5">最短距离（km）</div>
          <input
            className="n-input"
            type="number"
            step="0.5"
            value={prefs?.preferredDistanceKm?.min ?? 4}
            onChange={(e) => patch({ preferredDistanceKm: { min: Number(e.target.value), max: prefs?.preferredDistanceKm?.max ?? 8 } })}
          />
        </label>
        <label className="text-sm text-secondary">
          <div className="mb-1.5">最长距离（km）</div>
          <input
            className="n-input"
            type="number"
            step="0.5"
            value={prefs?.preferredDistanceKm?.max ?? 8}
            onChange={(e) => patch({ preferredDistanceKm: { min: prefs?.preferredDistanceKm?.min ?? 4, max: Number(e.target.value) } })}
          />
        </label>
        <label className="text-sm text-secondary">
          <div className="mb-1.5">最早出发</div>
          <input className="n-input" type="time" value={prefs?.startWindow?.from ?? "06:00"} onChange={(e) => patch({ startWindow: { from: e.target.value, to: prefs?.startWindow?.to ?? "09:30" } })} />
        </label>
        <label className="text-sm text-secondary">
          <div className="mb-1.5">最晚出发</div>
          <input className="n-input" type="time" value={prefs?.startWindow?.to ?? "09:30"} onChange={(e) => patch({ startWindow: { from: prefs?.startWindow?.from ?? "06:00", to: e.target.value } })} />
        </label>
      </div>

      <div className="mt-4">
        <div className="text-secondary mb-2 text-sm">偏好地形</div>
        <div className="flex flex-wrap gap-2">
          {runTerrains.map((t) => (
            <button
              key={t.value}
              type="button"
              className="n-toggle"
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
    <fieldset>
      <legend className="mb-3 text-xs font-medium uppercase tracking-wider text-tertiary">拍照偏好</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-secondary">
          <div className="mb-1.5">活动半径（km）</div>
          <input className="n-input" type="number" step="1" value={prefs?.mobilityRadiusKm ?? 12} onChange={(e) => patch({ mobilityRadiusKm: Number(e.target.value) })} />
        </label>
        <label className="text-sm text-secondary">
          <div className="mb-1.5">摄影水平</div>
          <select className="n-input" value={prefs?.cameraSkill ?? "beginner"} onChange={(e) => patch({ cameraSkill: e.target.value as CameraSkill })}>
            {cameraSkills.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4">
        <div className="text-secondary mb-2 text-sm">偏好题材</div>
        <div className="flex flex-wrap gap-2">
          {photoThemes.map((t) => (
            <button
              key={t.value}
              type="button"
              className="n-toggle n-toggle--pink"
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
      <h2 className="font-serif mb-1 text-xl font-semibold">参数设置</h2>
      <p className="text-secondary mb-6 text-sm">位置自动获取，偏好可自定义。</p>

      <LocationDisplay
        label={location.label}
        latitude={location.latitude}
        longitude={location.longitude}
        geoStatus={geoStatus}
        onRelocate={onRelocate}
      />
      <hr className="border-none border-t border-t-solid border-t-edge-light m-0 mb-6" />

      {scenarioId === "run_tomorrow"
        ? <RunPreferencesFields form={runForm} onChange={onRunChange} />
        : <PhotoPreferencesFields form={photoForm} onChange={onPhotoChange} />}
    </div>
  );
}
