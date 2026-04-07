import type { PhotoTheme, PhotoWeekRequest, RunPlanRequest, RunTerrain } from "@goclaw/contracts";
import { defaultPhotoForm, defaultRunForm } from "./constants";

const RUN_PREFERENCES_KEY = "goclaw.run-preferences.v1";
const PHOTO_PREFERENCES_KEY = "goclaw.photo-preferences.v1";
const defaultRunPreferences = defaultRunForm.preferences!;
const defaultPhotoPreferences = defaultPhotoForm.preferences!;
const RUN_TERRAIN_VALUES: readonly RunTerrain[] = ["flat", "shaded", "park", "waterfront", "track"];
const PHOTO_THEME_VALUES: readonly PhotoTheme[] = ["nature", "architecture", "humanity", "urban", "night", "waterfront"];

type PersistedRunPreferences = {
  preferredDistanceKm?: NonNullable<RunPlanRequest["preferences"]>["preferredDistanceKm"];
  terrain?: NonNullable<RunPlanRequest["preferences"]>["terrain"];
};

type PersistedPhotoPreferences = {
  mobilityRadiusKm?: NonNullable<PhotoWeekRequest["preferences"]>["mobilityRadiusKm"];
  themes?: NonNullable<PhotoWeekRequest["preferences"]>["themes"];
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string): T | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as T : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage write errors so the UI stays usable in private mode/quota pressure.
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRunTerrain(value: string): value is RunTerrain {
  return RUN_TERRAIN_VALUES.includes(value as RunTerrain);
}

function isPhotoTheme(value: string): value is PhotoTheme {
  return PHOTO_THEME_VALUES.includes(value as PhotoTheme);
}

export function loadPersistedRunForm(): RunPlanRequest {
  const persisted = readJson<PersistedRunPreferences>(RUN_PREFERENCES_KEY);
  const max = persisted?.preferredDistanceKm?.max;
  const min = persisted?.preferredDistanceKm?.min;
  const terrain = persisted?.terrain;
  const persistedTerrain = isStringArray(terrain) ? terrain.filter(isRunTerrain) : [];

  const preferredDistanceKm = typeof min === "number" && typeof max === "number" && min <= max
    ? { min, max }
    : defaultRunPreferences.preferredDistanceKm;

  return {
    ...defaultRunForm,
    preferences: {
      ...defaultRunPreferences,
      preferredDistanceKm,
      terrain: persistedTerrain.length > 0 ? persistedTerrain : defaultRunPreferences.terrain
    }
  };
}

export function savePersistedRunForm(form: RunPlanRequest) {
  const preferences = form.preferences ?? defaultRunPreferences;
  writeJson(RUN_PREFERENCES_KEY, {
    preferredDistanceKm: preferences.preferredDistanceKm,
    terrain: preferences.terrain
  } satisfies PersistedRunPreferences);
}

export function loadPersistedPhotoForm(): PhotoWeekRequest {
  const persisted = readJson<PersistedPhotoPreferences>(PHOTO_PREFERENCES_KEY);
  const radius = persisted?.mobilityRadiusKm;
  const themes = persisted?.themes;
  const persistedThemes = isStringArray(themes) ? themes.filter(isPhotoTheme) : [];

  return {
    ...defaultPhotoForm,
    preferences: {
      ...defaultPhotoPreferences,
      mobilityRadiusKm: typeof radius === "number" && Number.isFinite(radius)
        ? radius
        : defaultPhotoPreferences.mobilityRadiusKm,
      themes: persistedThemes.length > 0 ? persistedThemes : defaultPhotoPreferences.themes
    }
  };
}

export function savePersistedPhotoForm(form: PhotoWeekRequest) {
  const preferences = form.preferences ?? defaultPhotoPreferences;
  writeJson(PHOTO_PREFERENCES_KEY, {
    mobilityRadiusKm: preferences.mobilityRadiusKm,
    themes: preferences.themes
  } satisfies PersistedPhotoPreferences);
}
