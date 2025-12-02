import { TrainingProgress, TrainingStatus } from '@/entities/train';

export interface TrainingProgressResponse {
  epochs: number;
  error?: string;
  metrics?: TrainingMetricsResponse;
  status: string;
  timestamp: number;
}

interface TrainingMetricsResponse {
  epoch: number;
  lr_pg0: number;
  lr_pg1: number;
  lr_pg2: number;
  metrics_map50_95_b: number;
  metrics_map50_b: number;
  metrics_precision_b: number;
  metrics_recall_b: number;
  time: number;
  train_cls_loss: number;
  train_giou_loss: number;
  train_l1_loss: number;
  val_cls_loss: number;
  val_giou_loss: number;
  val_l1_loss: number;
}

export namespace TrainingProgressResponse {
  export function toEntity(
    response: TrainingProgressResponse,
  ): TrainingProgress {
    return {
      status: TrainingStatus.fromString(response.status),
      epochs: response.epochs,
      metrics: response.metrics
        ? {
            epoch: response.metrics.epoch,
            learningRateProgress0: response.metrics.lr_pg0,
            learningRateProgress1: response.metrics.lr_pg1,
            learningRateProgress2: response.metrics.lr_pg2,
            map50To95: response.metrics.metrics_map50_95_b,
            map50: response.metrics.metrics_map50_b,
            precision: response.metrics.metrics_precision_b,
            recall: response.metrics.metrics_recall_b,
            trainingTime: response.metrics.time,
            trainClsLoss: response.metrics.train_cls_loss,
            trainGiouLoss: response.metrics.train_giou_loss,
            trainL1Loss: response.metrics.train_l1_loss,
            validationClsLoss: response.metrics.val_cls_loss,
            validationGiouLoss: response.metrics.val_giou_loss,
            validationL1Loss: response.metrics.val_l1_loss,
          }
        : undefined,
      error: response.error,
      timestamp: new Date(response.timestamp * 1_000),
    };
  }
}
