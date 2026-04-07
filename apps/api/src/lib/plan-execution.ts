import { AsyncLocalStorage } from "node:async_hooks";
import type {
  PlanExecutionLogLevel,
  PlanExecutionStage,
  PlanExecutionStageStatus,
  PlanExecutionStreamEvent,
  PlanProcessStep,
  ScenarioId
} from "@goclaw/contracts";
import { toErrorMessage } from "./errors";

interface PlanExecutionState {
  scenarioId: ScenarioId;
  currentStageId?: string;
  emit: (event: PlanExecutionStreamEvent) => void;
  stages: Map<string, PlanExecutionStage>;
  statuses: Map<string, PlanExecutionStageStatus>;
}

const executionStorage = new AsyncLocalStorage<PlanExecutionState>();

function now(): string {
  return new Date().toISOString();
}

function emitStage(state: PlanExecutionState, stageId: string, status: PlanExecutionStageStatus) {
  const stage = state.stages.get(stageId);
  if (!stage) {
    return;
  }

  state.statuses.set(stageId, status);
  state.emit({
    type: "stage",
    stage,
    status,
    timestamp: now()
  });
}

export function createExecutionStages(steps: PlanProcessStep[]): PlanExecutionStage[] {
  return steps.map((step, order) => ({
    id: step.id,
    title: step.title,
    order,
    provider: step.provider,
    detail: step.detail
  }));
}

export async function runWithPlanExecution<T>(
  scenarioId: ScenarioId,
  stages: PlanExecutionStage[],
  emit: (event: PlanExecutionStreamEvent) => void,
  fn: () => Promise<T>
): Promise<T> {
  const state: PlanExecutionState = {
    scenarioId,
    emit,
    stages: new Map(stages.map((stage) => [stage.id, stage])),
    statuses: new Map()
  };

  emit({
    type: "start",
    scenarioId,
    stages,
    timestamp: now()
  });

  return await executionStorage.run(state, fn);
}

export async function withExecutionStage<T>(stageId: string, fn: () => Promise<T>): Promise<T> {
  const state = executionStorage.getStore();
  if (!state) {
    return await fn();
  }

  emitStage(state, stageId, "running");

  return await executionStorage.run({ ...state, currentStageId: stageId }, async () => {
    try {
      const result = await fn();
      emitStage(state, stageId, "completed");
      return result;
    } catch (error) {
      logPlanExecution("error", toErrorMessage(error), undefined, stageId);
      emitStage(state, stageId, "failed");
      throw error;
    }
  });
}

export function markExecutionStage(stageId: string, status: PlanExecutionStageStatus) {
  const state = executionStorage.getStore();
  if (!state) {
    return;
  }

  emitStage(state, stageId, status);
}

export function logPlanExecution(
  level: PlanExecutionLogLevel,
  message: string,
  detail?: string,
  stageId?: string
) {
  const state = executionStorage.getStore();
  if (!state) {
    return;
  }

  const targetStageId = stageId ?? state.currentStageId;
  if (!targetStageId || !state.stages.has(targetStageId)) {
    return;
  }

  state.emit({
    type: "log",
    entry: {
      stageId: targetStageId,
      level,
      message,
      detail,
      timestamp: now()
    }
  });
}

export function emitPlanData(dataType: "weather" | "candidates", payload: unknown) {
  const state = executionStorage.getStore();
  if (!state) {
    return;
  }

  state.emit({
    type: "data",
    dataType,
    payload,
    timestamp: now()
  });
}
