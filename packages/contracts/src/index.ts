import { z } from "zod";

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const scenarioIdSchema = z.enum(["run_tomorrow", "photo_week"]);
export type ScenarioId = z.infer<typeof scenarioIdSchema>;

export const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  label: z.string().min(1).optional()
});
export type Coordinates = z.infer<typeof coordinatesSchema>;

export const distanceRangeSchema = z.object({
  min: z.number().positive(),
  max: z.number().positive()
}).refine((range: { min: number; max: number }) => range.max >= range.min, {
  message: "max must be greater than or equal to min"
});

export const runTerrainSchema = z.enum(["flat", "shaded", "park", "waterfront", "track"]);
export const photoThemeSchema = z.enum(["nature", "urban", "humanity", "night", "architecture", "waterfront"]);
export const cameraSkillSchema = z.enum(["beginner", "intermediate", "advanced"]);
export type RunTerrain = z.infer<typeof runTerrainSchema>;
export type PhotoTheme = z.infer<typeof photoThemeSchema>;
export type CameraSkill = z.infer<typeof cameraSkillSchema>;

export const runPreferencesSchema = z.object({
  paceMinPerKm: z.number().min(3).max(15).optional(),
  preferredDistanceKm: distanceRangeSchema.optional(),
  terrain: z.array(runTerrainSchema).optional(),
  avoidHighUv: z.boolean().optional(),
  startWindow: z.object({
    from: z.string().regex(timePattern),
    to: z.string().regex(timePattern)
  }).optional()
});
export type RunPreferences = z.infer<typeof runPreferencesSchema>;

export const photoPreferencesSchema = z.object({
  themes: z.array(photoThemeSchema).optional(),
  mobilityRadiusKm: z.number().min(1).max(50).optional(),
  cameraSkill: cameraSkillSchema.optional()
});
export type PhotoPreferences = z.infer<typeof photoPreferencesSchema>;

export const runPlanRequestSchema = z.object({
  location: coordinatesSchema,
  timezone: z.string().min(1).default("Asia/Shanghai"),
  preferences: runPreferencesSchema.optional()
});
export type RunPlanRequest = z.infer<typeof runPlanRequestSchema>;

export const photoWeekRequestSchema = z.object({
  location: coordinatesSchema,
  timezone: z.string().min(1).default("Asia/Shanghai"),
  preferences: photoPreferencesSchema.optional()
});
export type PhotoWeekRequest = z.infer<typeof photoWeekRequestSchema>;

export const runRouteSchema = z.object({
  name: z.string(),
  distanceKm: z.number().positive(),
  estTimeMin: z.number().int().positive(),
  why: z.string(),
  tags: z.array(z.string()),
  navigationUrl: z.string().url(),
  routeSource: z.string(),
  poiCoordinates: coordinatesSchema
});
export type RunRoute = z.infer<typeof runRouteSchema>;

export const runPlanSchema = z.object({
  type: z.literal("run_tomorrow"),
  city: z.string(),
  targetDate: z.string(),
  weatherSummary: z.string(),
  bestTime: z.string(),
  reason: z.string(),
  routes: z.array(runRouteSchema).min(1),
  tips: z.array(z.string()).min(1),
  meta: z.object({
    weatherProvider: z.string(),
    poiProvider: z.string(),
    routingProvider: z.string(),
    aiEnhanced: z.boolean()
  })
});
export type RunPlan = z.infer<typeof runPlanSchema>;

export const photoSpotSchema = z.object({
  name: z.string(),
  reason: z.string(),
  bestTime: z.string(),
  way: z.string(),
  camera: z.object({
    iso: z.string(),
    aperture: z.string(),
    shutter: z.string(),
    whiteBalance: z.string()
  }),
  cameraSummary: z.string(),
  tip: z.string(),
  categories: z.array(z.string()),
  navigationUrl: z.string().url(),
  poiCoordinates: coordinatesSchema
});
export type PhotoSpot = z.infer<typeof photoSpotSchema>;

export const photoDayPlanSchema = z.object({
  date: z.string(),
  weather: z.string(),
  spots: z.array(photoSpotSchema).min(1),
  tips: z.array(z.string()).min(1)
});
export type PhotoDayPlan = z.infer<typeof photoDayPlanSchema>;

export const photoWeekPlanSchema = z.object({
  type: z.literal("photo_week"),
  city: z.string(),
  rangeLabel: z.string(),
  days: z.array(photoDayPlanSchema).min(1),
  tips: z.array(z.string()).min(1),
  meta: z.object({
    weatherProvider: z.string(),
    poiProvider: z.string(),
    routingProvider: z.string(),
    aiEnhanced: z.boolean()
  })
});
export type PhotoWeekPlan = z.infer<typeof photoWeekPlanSchema>;

export const planResultSchema = z.discriminatedUnion("type", [
  runPlanSchema,
  photoWeekPlanSchema
]);
export type PlanResult = z.infer<typeof planResultSchema>;

export const apiSuccessSchema = <T extends z.ZodTypeAny>(schema: T) => z.object({
  ok: z.literal(true),
  data: schema
});

export const apiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    message: z.string(),
    issues: z.unknown().optional()
  })
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const locationLabelSchema = z.object({
  city: z.string(),
  district: z.string().optional(),
  displayName: z.string()
});
export type LocationLabel = z.infer<typeof locationLabelSchema>;

export const scenarioManifestSchema = z.object({
  id: scenarioIdSchema,
  title: z.string(),
  cta: z.string(),
  description: z.string(),
  capabilities: z.array(z.string()),
  estimatedLatencyMs: z.number().int().positive()
});
export type ScenarioManifest = z.infer<typeof scenarioManifestSchema>;

export const scenarioCatalog: ScenarioManifest[] = [
  {
    id: "run_tomorrow",
    title: "明天跑步",
    cta: "去跑步",
    description: "结合天气、紫外线与真实 POI 路线，给出明天最佳跑步时间和 3 条推荐路线。",
    capabilities: ["天气判断", "路线测距", "POI 推荐", "补水/防晒建议"],
    estimatedLatencyMs: 2200
  },
  {
    id: "photo_week",
    title: "最近一周拍照",
    cta: "想拍照",
    description: "结合未来 7 天天气与城市摄影点，输出每日地点、构图和相机参数建议。",
    capabilities: ["7 天天气", "摄影点推荐", "拍摄方式", "相机参数"],
    estimatedLatencyMs: 3200
  }
];

export function isPlanResult(value: unknown): value is PlanResult {
  return planResultSchema.safeParse(value).success;
}
