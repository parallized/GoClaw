import { coordinatesSchema, type ScenarioId, scenarioCatalog } from "@goplan/contracts";
import { Elysia } from "elysia";
import type { ScenarioPlannerContext } from "../domain/scenario-definition";
import { scenarioMap } from "../domain/scenarios";
import { AppError, toErrorMessage } from "../lib/errors";

export function createPlanRoutes(context: ScenarioPlannerContext) {
  return new Elysia({ prefix: "/api" })
    .get("/health", () => ({ ok: true, service: "goplan-api" }))
    .get("/scenarios", () => ({ ok: true, data: scenarioCatalog }))
    .get("/location-label", async ({ query, set }) => {
      try {
        const location = coordinatesSchema.parse({
          latitude: Number(query.latitude),
          longitude: Number(query.longitude)
        });
        const result = await context.geocodingProvider.reverseGeocode(location);
        return { ok: true, data: result };
      } catch (error) {
        if (error instanceof AppError) {
          set.status = error.status;
          return {
            ok: false,
            error: {
              message: error.message,
              issues: error.issues
            }
          };
        }

        if (error && typeof error === "object" && "issues" in error) {
          set.status = 400;
          return {
            ok: false,
            error: {
              message: "请求参数校验失败",
              issues: error
            }
          };
        }

        set.status = 500;
        return {
          ok: false,
          error: {
            message: toErrorMessage(error)
          }
        };
      }
    })
    .post("/plans/:scenarioId", async ({ params, body, set }) => {
      try {
        const scenarioId = params.scenarioId as ScenarioId;
        const scenario = scenarioMap[scenarioId];
        if (!scenario) {
          throw new AppError(`未知场景：${params.scenarioId}`, 404);
        }

        const input = scenario.inputSchema.parse(body);
        const result = await scenario.plan(context, input as never);
        return { ok: true, data: result };
      } catch (error) {
        if (error instanceof AppError) {
          set.status = error.status;
          return {
            ok: false,
            error: {
              message: error.message,
              issues: error.issues
            }
          };
        }

        if (error && typeof error === "object" && "issues" in error) {
          set.status = 400;
          return {
            ok: false,
            error: {
              message: "请求参数校验失败",
              issues: error
            }
          };
        }

        set.status = 500;
        return {
          ok: false,
          error: {
            message: toErrorMessage(error)
          }
        };
      }
    });
}
