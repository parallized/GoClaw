import type { CameraSkill, PhotoTheme, RunTerrain, ScenarioId } from "@goplan/contracts";
import type { PhotoWeekRequest, RunPlanRequest } from "@goplan/contracts";

interface FormSectionProps {
  scenarioId: ScenarioId;
  runForm: RunPlanRequest;
  photoForm: PhotoWeekRequest;
  onRunChange: (next: RunPlanRequest) => void;
  onPhotoChange: (next: PhotoWeekRequest) => void;
}

const runTerrains: Array<{ value: RunTerrain; label: string }> = [
  { value: "park", label: "公园" },
  { value: "shaded", label: "树荫" },
  { value: "flat", label: "平路" },
  { value: "waterfront", label: "临水" },
  { value: "track", label: "田径场" }
];

const photoThemes: Array<{ value: PhotoTheme; label: string }> = [
  { value: "nature", label: "自然" },
  { value: "architecture", label: "建筑" },
  { value: "humanity", label: "人文" },
  { value: "urban", label: "城市" },
  { value: "night", label: "夜景" },
  { value: "waterfront", label: "水边" }
];

const cameraSkills: Array<{ value: CameraSkill; label: string }> = [
  { value: "beginner", label: "新手" },
  { value: "intermediate", label: "进阶" },
  { value: "advanced", label: "高级" }
];

function baseInputClassName() {
  return "w-full rounded-xl border border-white/10 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400";
}

function toggleValues<T extends string>(current: T[] | undefined, value: T): T[] {
  const set = new Set(current ?? []);
  if (set.has(value)) {
    set.delete(value);
  } else {
    set.add(value);
  }

  return Array.from(set);
}

export function FormSection({ scenarioId, runForm, photoForm, onRunChange, onPhotoChange }: FormSectionProps) {
  const location = scenarioId === "run_tomorrow" ? runForm.location : photoForm.location;

  const updateLocation = (key: "latitude" | "longitude" | "label", value: string) => {
    if (scenarioId === "run_tomorrow") {
      onRunChange({
        ...runForm,
        location: {
          ...runForm.location,
          [key]: key === "label" ? value : Number(value)
        }
      });
      return;
    }

    onPhotoChange({
      ...photoForm,
      location: {
        ...photoForm.location,
        [key]: key === "label" ? value : Number(value)
      }
    });
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">输入参数</h2>
          <p className="mt-1 text-sm text-slate-300">基于真实坐标、偏好和时间窗口生成规划。</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm text-slate-200">
          <div className="mb-2">城市标签</div>
          <input className={baseInputClassName()} value={location.label ?? ""} onChange={(event) => updateLocation("label", event.target.value)} placeholder="例如：北京国贸" />
        </label>
        <label className="text-sm text-slate-200">
          <div className="mb-2">纬度</div>
          <input className={baseInputClassName()} type="number" step="0.0001" value={location.latitude} onChange={(event) => updateLocation("latitude", event.target.value)} />
        </label>
        <label className="text-sm text-slate-200">
          <div className="mb-2">经度</div>
          <input className={baseInputClassName()} type="number" step="0.0001" value={location.longitude} onChange={(event) => updateLocation("longitude", event.target.value)} />
        </label>
      </div>

      {scenarioId === "run_tomorrow" ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-200">
            <div className="mb-2">配速（分钟/km）</div>
            <input
              className={baseInputClassName()}
              type="number"
              step="0.1"
              value={runForm.preferences?.paceMinPerKm ?? 6.5}
              onChange={(event) => onRunChange({
                ...runForm,
                preferences: {
                  ...runForm.preferences,
                  paceMinPerKm: Number(event.target.value)
                }
              })}
            />
          </label>
          <label className="text-sm text-slate-200">
            <div className="mb-2">是否避开高 UV</div>
            <select
              className={baseInputClassName()}
              value={String(runForm.preferences?.avoidHighUv ?? true)}
              onChange={(event) => onRunChange({
                ...runForm,
                preferences: {
                  ...runForm.preferences,
                  avoidHighUv: event.target.value === "true"
                }
              })}
            >
              <option value="true">是</option>
              <option value="false">否</option>
            </select>
          </label>
          <label className="text-sm text-slate-200">
            <div className="mb-2">最短距离（km）</div>
            <input
              className={baseInputClassName()}
              type="number"
              step="0.5"
              value={runForm.preferences?.preferredDistanceKm?.min ?? 4}
              onChange={(event) => onRunChange({
                ...runForm,
                preferences: {
                  ...runForm.preferences,
                  preferredDistanceKm: {
                    min: Number(event.target.value),
                    max: runForm.preferences?.preferredDistanceKm?.max ?? 8
                  }
                }
              })}
            />
          </label>
          <label className="text-sm text-slate-200">
            <div className="mb-2">最长距离（km）</div>
            <input
              className={baseInputClassName()}
              type="number"
              step="0.5"
              value={runForm.preferences?.preferredDistanceKm?.max ?? 8}
              onChange={(event) => onRunChange({
                ...runForm,
                preferences: {
                  ...runForm.preferences,
                  preferredDistanceKm: {
                    min: runForm.preferences?.preferredDistanceKm?.min ?? 4,
                    max: Number(event.target.value)
                  }
                }
              })}
            />
          </label>
          <label className="text-sm text-slate-200">
            <div className="mb-2">最早出发</div>
            <input
              className={baseInputClassName()}
              type="time"
              value={runForm.preferences?.startWindow?.from ?? "06:00"}
              onChange={(event) => onRunChange({
                ...runForm,
                preferences: {
                  ...runForm.preferences,
                  startWindow: {
                    from: event.target.value,
                    to: runForm.preferences?.startWindow?.to ?? "09:30"
                  }
                }
              })}
            />
          </label>
          <label className="text-sm text-slate-200">
            <div className="mb-2">最晚出发</div>
            <input
              className={baseInputClassName()}
              type="time"
              value={runForm.preferences?.startWindow?.to ?? "09:30"}
              onChange={(event) => onRunChange({
                ...runForm,
                preferences: {
                  ...runForm.preferences,
                  startWindow: {
                    from: runForm.preferences?.startWindow?.from ?? "06:00",
                    to: event.target.value
                  }
                }
              })}
            />
          </label>
          <div className="md:col-span-2">
            <div className="mb-2 text-sm text-slate-200">偏好地形</div>
            <div className="flex flex-wrap gap-2">
              {runTerrains.map((terrain) => {
                const active = runForm.preferences?.terrain?.includes(terrain.value);
                return (
                  <button
                    key={terrain.value}
                    type="button"
                    className={[
                      "rounded-full border px-3 py-1.5 text-sm transition",
                      active ? "border-cyan-400 bg-cyan-500/10 text-cyan-200" : "border-white/10 bg-white/5 text-slate-200"
                    ].join(" ")}
                    onClick={() => onRunChange({
                      ...runForm,
                      preferences: {
                        ...runForm.preferences,
                        terrain: toggleValues(runForm.preferences?.terrain, terrain.value)
                      }
                    })}
                  >
                    {terrain.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-200">
            <div className="mb-2">活动半径（km）</div>
            <input
              className={baseInputClassName()}
              type="number"
              step="1"
              value={photoForm.preferences?.mobilityRadiusKm ?? 12}
              onChange={(event) => onPhotoChange({
                ...photoForm,
                preferences: {
                  ...photoForm.preferences,
                  mobilityRadiusKm: Number(event.target.value)
                }
              })}
            />
          </label>
          <label className="text-sm text-slate-200">
            <div className="mb-2">摄影水平</div>
            <select
              className={baseInputClassName()}
              value={photoForm.preferences?.cameraSkill ?? "beginner"}
              onChange={(event) => onPhotoChange({
                ...photoForm,
                preferences: {
                  ...photoForm.preferences,
                  cameraSkill: event.target.value as CameraSkill
                }
              })}
            >
              {cameraSkills.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <div className="md:col-span-2">
            <div className="mb-2 text-sm text-slate-200">偏好题材</div>
            <div className="flex flex-wrap gap-2">
              {photoThemes.map((theme) => {
                const active = photoForm.preferences?.themes?.includes(theme.value);
                return (
                  <button
                    key={theme.value}
                    type="button"
                    className={[
                      "rounded-full border px-3 py-1.5 text-sm transition",
                      active ? "border-fuchsia-400 bg-fuchsia-500/10 text-fuchsia-200" : "border-white/10 bg-white/5 text-slate-200"
                    ].join(" ")}
                    onClick={() => onPhotoChange({
                      ...photoForm,
                      preferences: {
                        ...photoForm.preferences,
                        themes: toggleValues(photoForm.preferences?.themes, theme.value)
                      }
                    })}
                  >
                    {theme.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

