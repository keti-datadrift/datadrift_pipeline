export enum TrainingStatus {
  TRAINING_STARTED = 'training_started',
  TRAINING_PROGRESS = 'training_progress',
  TRAINING_COMPLETED = 'training_completed',
  TRAINING_FAILED = 'training_failed',
}

export namespace TrainingStatus {
  export function allCases(): TrainingStatus[] {
    return [
      TrainingStatus.TRAINING_STARTED,
      TrainingStatus.TRAINING_PROGRESS,
      TrainingStatus.TRAINING_COMPLETED,
      TrainingStatus.TRAINING_FAILED,
    ];
  }

  export function fromString(status: string): TrainingStatus {
    switch (status) {
      case 'training_started':
        return TrainingStatus.TRAINING_STARTED;
      case 'training_progress':
        return TrainingStatus.TRAINING_PROGRESS;
      case 'training_completed':
        return TrainingStatus.TRAINING_COMPLETED;
      case 'training_failed':
        return TrainingStatus.TRAINING_FAILED;
      default:
        throw new TypeError(`Invalid training status: ${status}`);
    }
  }
}

export interface TrainingProgress {
  status: TrainingStatus;
  epochs: number;
  metrics?: TrainingMetrics;
  error?: string;
  timestamp: Date;
}

interface TrainingMetrics {
  epoch: number;
  /** refers to the learning rate for the backbone weights */
  learningRateProgress0: number;
  /** associated with the learning rate for the YOLO layers' weights */
  learningRateProgress1: number;
  /** represents the learning rate for any additional parameters, such as biases */
  learningRateProgress2: number;
  map50To95: number;
  map50: number;
  precision: number;
  recall: number;
  trainingTime: number;
  trainClsLoss: number;
  trainGiouLoss: number;
  trainL1Loss: number;
  validationClsLoss: number;
  validationGiouLoss: number;
  validationL1Loss: number;
}
