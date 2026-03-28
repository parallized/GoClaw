import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { env, isAiEnabled, isAmapWebServiceEnabled } from "./config/env";
import { createPlanRoutes } from "./routes/plans";
import { OpenAiCompatibleProvider } from "./infrastructure/ai/openai-compatible";
import { AmapGeocodingProvider } from "./infrastructure/geocoding/amap";
import { FallbackGeocodingProvider } from "./infrastructure/geocoding/fallback";
import { NominatimGeocodingProvider } from "./infrastructure/geocoding/nominatim";
import { AmapNavigationProvider } from "./infrastructure/navigation/amap";
import { AmapPoiProvider } from "./infrastructure/poi/amap";
import { FallbackPoiProvider } from "./infrastructure/poi/fallback";
import { OverpassPoiProvider } from "./infrastructure/poi/overpass";
import { OsrmRoutingProvider } from "./infrastructure/routing/osrm";
import { OpenMeteoWeatherProvider } from "./infrastructure/weather/open-meteo";

const nominatimProvider = new NominatimGeocodingProvider();
const overpassProvider = new OverpassPoiProvider(env.poiOverpassEndpoints);

const geocodingProvider = isAmapWebServiceEnabled()
  ? new FallbackGeocodingProvider(
      new AmapGeocodingProvider({
        key: env.amapWebServiceKey!,
        baseUrl: env.amapWebServiceBaseUrl
      }),
      nominatimProvider
    )
  : nominatimProvider;

const poiProvider = isAmapWebServiceEnabled()
  ? new FallbackPoiProvider(
      new AmapPoiProvider({
        key: env.amapWebServiceKey!,
        baseUrl: env.amapWebServiceBaseUrl
      }),
      overpassProvider
    )
  : overpassProvider;

const plannerContext = {
  weatherProvider: new OpenMeteoWeatherProvider(),
  geocodingProvider,
  poiProvider,
  routingProvider: new OsrmRoutingProvider(),
  navigationProvider: new AmapNavigationProvider(),
  aiProvider: isAiEnabled() ? new OpenAiCompatibleProvider() : null
};

const app = new Elysia()
  .use(cors({ origin: env.corsOrigin }))
  .use(createPlanRoutes(plannerContext));

app.listen(env.apiPort);


console.log(`GoClaw API 已启动：http://localhost:${env.apiPort}`);

