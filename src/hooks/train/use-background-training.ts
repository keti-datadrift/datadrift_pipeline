import { useBackgroundTasks } from '@/contexts/BackgroundTaskContext';
import {
  TrainingExecutorConfig,
  TrainingSSEExecutor,
} from '@/lib/background-tasks/training-executor';
import {
  BackgroundTaskConfig,
  BackgroundTaskStatus,
  TASK_TYPES,
} from '@/lib/background-tasks/types';
import { useCallback, useMemo } from 'react';

interface UseBackgroundTrainingOptions {
  modelId: number;
  taskIds: number[];
  modelVersionID?: number;
  modelType?: string;
  projectName?: string;
  isAllSelected: boolean;
}

export function useBackgroundTraining({
  modelId,
  taskIds,
  modelVersionID,
  modelType,
  projectName,
  isAllSelected,
}: UseBackgroundTrainingOptions) {
  const { tasks, startTask, cancelTask, getTasksByType } = useBackgroundTasks();

  const taskId = useMemo(() => {
    const taskIdsHash = [...taskIds].sort((a, b) => a - b).join('-');
    return `training-${modelId}-${modelVersionID || 'latest'}-tasks-${taskIdsHash}`;
  }, [modelId, modelVersionID, taskIds]);

  const currentTask = useMemo(() => {
    return tasks.find((task) => task.id === taskId) || null;
  }, [tasks, taskId]);

  const trainingTasks = useMemo(() => {
    return getTasksByType(TASK_TYPES.TRAINING);
  }, [getTasksByType]);

  const isTraining = useMemo(() => {
    return (
      currentTask?.status === BackgroundTaskStatus.RUNNING ||
      currentTask?.status === BackgroundTaskStatus.PENDING
    );
  }, [currentTask]);

  const isStarting = useMemo(() => {
    return currentTask?.status === BackgroundTaskStatus.PENDING;
  }, [currentTask]);

  const canStartTraining = useMemo(() => {
    return isAllSelected && !isTraining && !isStarting;
  }, [isAllSelected, isTraining, isStarting]);

  const trainingProgress = useMemo(() => {
    const progress = currentTask?.progress;
    return progress?.type === 'numeric' ? progress.percentage : 0;
  }, [currentTask?.progress]);

  const currentEpoch = useMemo(() => {
    const progress = currentTask?.progress;
    return progress?.type === 'numeric' ? progress.current : 0;
  }, [currentTask?.progress]);

  const totalEpochs = useMemo(() => {
    const progress = currentTask?.progress;
    return progress?.type === 'numeric' ? progress.total : 0;
  }, [currentTask?.progress]);

  const trainingLoss = useMemo(() => {
    const progress = currentTask?.progress;
    return progress?.metadata?.trainClsLoss || null;
  }, [currentTask?.progress]);

  const trainingError = useMemo(() => {
    return currentTask?.error || null;
  }, [currentTask?.error]);

  const startTraining = useCallback(async () => {
    if (!canStartTraining) return;

    const config: BackgroundTaskConfig = {
      id: taskId,
      type: TASK_TYPES.TRAINING,
      title: `Training ${modelType || 'Model'} #${modelId}`,
      description: projectName ? `Project: ${projectName}` : undefined,
      metadata: {
        modelId,
        modelVersionID,
        modelType,
        projectName,
      },
    };

    const executorConfig: TrainingExecutorConfig = {
      mlBackendID: modelId,
      taskIDs: taskIds,
      modelVersionID,
    };

    const executor = new TrainingSSEExecutor(executorConfig);

    try {
      await startTask(config, executor);
    } catch (error) {
      console.error('Failed to start training task:', error);
    }
  }, [
    canStartTraining,
    taskId,
    modelType,
    modelId,
    projectName,
    modelVersionID,
    taskIds,
    startTask,
  ]);

  const stopTraining = useCallback(() => {
    if (currentTask && isTraining) {
      cancelTask(taskId);
    }
  }, [currentTask, isTraining, cancelTask, taskId]);

  return {
    taskId,
    currentTask,
    trainingTasks,
    isTraining,
    isStarting,
    canStartTraining,
    trainingProgress,
    currentEpoch,
    totalEpochs,
    trainingLoss,
    trainingError,
    startTraining,
    stopTraining,
  };
}
