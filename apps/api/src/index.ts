import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { env, isAiEnabled } from "./config/env";
import { createPlanRoutes } from "./routes/plans";
import { OpenAiCompatibleProvider } from "./infrastructure/ai/openai-compatible";
import { NominatimGeocodingProvider } from "./infrastructure/geocoding/nominatim";
import { AmapNavigationProvider } from "./infrastructure/navigation/amap";
import { OverpassPoiProvider } from "./infrastructure/poi/overpass";
import { OsrmRoutingProvider } from "./infrastructure/routing/osrm";
import { OpenMeteoWeatherProvider } from "./infrastructure/weather/open-meteo";

const plannerContext = {
  weatherProvider: new OpenMeteoWeatherProvider(),
  geocodingProvider: new NominatimGeocodingProvider(),
  poiProvider: new OverpassPoiProvider(),
  routingProvider: new OsrmRoutingProvider(),
  navigationProvider: new AmapNavigationProvider(),
  aiProvider: isAiEnabled() ? new OpenAiCompatibleProvider() : null
};

const app = new Elysia()
  .use(cors({ origin: env.corsOrigin }))
  .use(createPlanRoutes(plannerContext));

app.listen(env.apiPort);

console.log(`GoPlan API 已启动：http://localhost:${env.apiPort}`);
