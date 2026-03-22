import { photoWeekScenario } from "./photo-week";
import { runTomorrowScenario } from "./run-tomorrow";

export const scenarios = [runTomorrowScenario, photoWeekScenario] as const;

export const scenarioMap = Object.fromEntries(
  scenarios.map((scenario) => [scenario.id, scenario])
) as Record<(typeof scenarios)[number]["id"], (typeof scenarios)[number]>;
