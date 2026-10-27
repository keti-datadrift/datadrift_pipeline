import { useCallback, useMemo, useState } from 'react';

import { TrainingProgress, TrainingStatus } from '@/entities/train';
import { useTrain } from '@/hooks/network/models';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface TrainingStateProps {
  trainingProgress: number;
  totalEpochs: number;
  currentEpoch: number;
  trainingLoss: number | null;
  trainingStatus: string;
  isTraining: boolean;
  isStarting: boolean;
  trainingError: string | null;
  canStartTraining: boolean;
  trainingData: TrainingProgress | null;

  startTraining: () => void;
  resetTraining: () => void;
}

interface UseTrainingStateOptions {
  modelId: number;
  taskIds: number[];
  modelVersionID?: number;
  isAllSelected: boolean;
}

const getTrainingStatusMessage = (
  status: TrainingStatus,
  currentEpoch: number,
  totalEpochs: number,
): string => {
  switch (status) {
    case TrainingStatus.TRAINING_STARTED:
      return 'Training started...';
    case TrainingStatus.TRAINING_PROGRESS:
      return `Training epoch ${currentEpoch}/${totalEpochs}...`;
    case TrainingStatus.TRAINING_COMPLETED:
      return 'Training completed';
    case TrainingStatus.TRAINING_FAILED:
      return 'Training failed';
    default:
      return 'Unknown status';
  }
};

export const useTrainingState = ({
  modelId,
  taskIds,
  modelVersionID,
  isAllSelected,
}: UseTrainingStateOptions): TrainingStateProps => {
  const [isStarting, setIsStarting] = useState(false);

  const {
    data: trainingData,
    loading: isTraining,
    error: trainingError,
    refetch: startTrainingRequest,
    reset: resetTrainingData,
  } = useTrain(modelId, taskIds, modelVersionID);

  const actualIsStarting = isTraining ? false : isStarting;

  const trainingProgress = useMemo(() => {
    return trainingData?.metrics?.epoch && trainingData.epochs
      ? (trainingData.metrics.epoch / trainingData.epochs) * 100
      : 0;
  }, [trainingData?.metrics?.epoch, trainingData?.epochs]);

  const totalEpochs = useMemo(
    () => trainingData?.epochs || 0,
    [trainingData?.epochs],
  );
  const currentEpoch = useMemo(
    () => trainingData?.metrics?.epoch || 0,
    [trainingData?.metrics?.epoch],
  );
  const trainingLoss = useMemo(
    () => trainingData?.metrics?.trainClsLoss || null,
    [trainingData?.metrics?.trainClsLoss],
  );

  const trainingStatus = useMemo(() => {
    return trainingData
      ? getTrainingStatusMessage(
          trainingData.status,
          currentEpoch,
          trainingData.epochs,
        )
      : trainingError || '';
  }, [trainingData, currentEpoch, trainingError]);

  const canStartTraining = useMemo(() => {
    return isAllSelected && !actualIsStarting && !isTraining;
  }, [isAllSelected, actualIsStarting, isTraining]);

  const startTraining = useCallback(() => {
    if (!canStartTraining) return;

    setIsStarting(true);
    void startTrainingRequest();
  }, [canStartTraining, startTrainingRequest]);

  const resetTraining = useCallback(() => {
    resetTrainingData();
    setIsStarting(false);
  }, [resetTrainingData]);

  return {
    trainingProgress,
    totalEpochs,
    currentEpoch,
    trainingLoss,
    trainingStatus,
    isTraining,
    isStarting: actualIsStarting,
    trainingError,
    canStartTraining,
    trainingData,
    startTraining,
    resetTraining,
  };
};
