import type { Coordinates, PhotoWeekRequest, RunPlanRequest, ScenarioId } from "@goclaw/contracts";

export const defaultLocation: Coordinates = {
  latitude: 39.9042,
  longitude: 116.4074,
  label: "北京"
};

export const defaultScenarioId: ScenarioId = "run_tomorrow";

export const defaultRunForm: RunPlanRequest = {
  location: defaultLocation,
  timezone: "Asia/Shanghai",
  preferences: {
    paceMinPerKm: 6.5,
    preferredDistanceKm: {
      min: 4,
      max: 8
    },
    terrain: ["park", "shaded"],
    avoidHighUv: true,
    startWindow: {
      from: "06:00",
      to: "09:30"
    }
  }
};

export const defaultPhotoForm: PhotoWeekRequest = {
  location: defaultLocation,
  timezone: "Asia/Shanghai",
  preferences: {
    themes: ["nature", "architecture"],
    mobilityRadiusKm: 12,
    cameraSkill: "beginner"
  }
};

