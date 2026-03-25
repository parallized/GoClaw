import type { z } from "zod";
import type { PlanProcessStep, ScenarioId, ScenarioManifest } from "@goplan/contracts";
import type {
  AiProvider,
  GeocodingProvider,
  NavigationProvider,
  PoiProvider,
  RoutingProvider,
  WeatherProvider
} from "./service-types";

export interface ScenarioPlannerContext {
  weatherProvider: WeatherProvider;
  geocodingProvider: GeocodingProvider;
  poiProvider: PoiProvider;
  routingProvider: RoutingProvider;
  navigationProvider: NavigationProvider;
  aiProvider: AiProvider | null;
}

export interface ScenarioDefinition<TInputSchema extends z.ZodTypeAny, TOutputSchema extends z.ZodTypeAny> {
  id: ScenarioId;
  manifest: ScenarioManifest;
  inputSchema: TInputSchema;
  outputSchema: TOutputSchema;
  getExecutionStages?(context: ScenarioPlannerContext): PlanProcessStep[];
  plan(context: ScenarioPlannerContext, input: z.infer<TInputSchema>): Promise<z.infer<TOutputSchema>>;
}
