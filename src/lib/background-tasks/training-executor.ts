import { invokeTraining } from '@/api/endpoints/ml-models';
import { TrainingProgressResponse } from '@/api/types';
import { TrainingProgress, TrainingStatus } from '@/entities/train';
import {
  BackgroundTaskProgress,
  BackgroundTaskStatus,
  SSETaskExecutor,
} from './types';

export interface TrainingExecutorConfig {
  mlBackendID: number;
  taskIDs: number[];
  modelVersionID?: number;
}

export class TrainingSSEExecutor implements SSETaskExecutor<any> {
  constructor(private config: TrainingExecutorConfig) {}

  async *execute(): AsyncGenerator<any, any, unknown> {
    const generator = invokeTraining(
      this.config.mlBackendID,
      this.config.taskIDs,
      this.config.modelVersionID,
    );

    for await (const event of generator) {
      yield event;
    }
  }

  parseEvent = (event: any): TrainingProgress | null => {
    try {
      let progressData: TrainingProgressResponse;

      if (typeof event.data === 'string') {
        progressData = JSON.parse(event.data) as TrainingProgressResponse;
      } else if (typeof event.data === 'object' && event.data !== null) {
        progressData = event.data as TrainingProgressResponse;
      } else {
        console.warn(
          'Unexpected event data type:',
          typeof event.data,
          event.data,
        );
        return null;
      }

      return TrainingProgressResponse.toEntity(progressData);
    } catch (parseError) {
      console.warn('Failed to parse training progress data:', parseError);
      return null;
    }
  };

  extractProgress = (data: TrainingProgress): BackgroundTaskProgress | null => {
    if (!data.metrics?.epoch || !data.epochs) {
      return null;
    }

    const percentage = (data.metrics.epoch / data.epochs) * 100;

    return {
      type: 'numeric',
      current: data.metrics.epoch,
      total: data.epochs,
      percentage,
      message: `Epoch ${data.metrics.epoch}/${data.epochs}`,
      metadata: {
        trainClsLoss: data.metrics.trainClsLoss,
        valClsLoss: data.metrics.validationClsLoss,
      },
    };
  };

  extractStatus = (data: TrainingProgress): BackgroundTaskStatus | null => {
    switch (data.status) {
      case TrainingStatus.TRAINING_STARTED:
        return BackgroundTaskStatus.RUNNING;
      case TrainingStatus.TRAINING_PROGRESS:
        return BackgroundTaskStatus.RUNNING;
      case TrainingStatus.TRAINING_COMPLETED:
        return BackgroundTaskStatus.COMPLETED;
      case TrainingStatus.TRAINING_FAILED:
        return BackgroundTaskStatus.FAILED;
      default:
        return null;
    }
  };

  extractError = (data: TrainingProgress): string | null => {
    if (data.status === TrainingStatus.TRAINING_FAILED) {
      return 'Training failed';
    }
    return null;
  };
}
