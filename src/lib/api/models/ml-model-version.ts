// Model Version interfaces and types for API responses

import {
  ModelVersion,
  TrainingArgs,
  TrainingMetrics,
} from '@/entities/ml-model';
import { parseNumber } from '@/lib/utils/number.util';
import { formatRelativeTime } from '@/utils/time.util';
import { PaginatedResponse } from './pagination';
import { formatRelativeTime } from '@/utils/time.util';

export interface MLModelVersionResponse {
  id: number;
  ml_model: number;
  trained_at: string;
  weight: string;
  version: string;
  training_args?: Record<string, any>;
  metrics?: Record<string, any>;
  notes?: string;
}

export type GetMLModelVersionsResponse =
  PaginatedResponse<MLModelVersionResponse>;

export namespace MLModelVersionResponse {
  export function toEntity(response: MLModelVersionResponse): ModelVersion {
    const metrics = response.metrics || {};
    const trainingMetrics: TrainingMetrics = {
      epochs: parseNumber(metrics['epoch']),
      trainingTime: parseNumber(metrics['time']),
      precision: parseNumber(metrics['metrics/precision(B)']),
      recall: parseNumber(metrics['metrics/recall(B)']),
      map50: parseNumber(metrics['metrics/mAP50(B)']),
      map50to95: parseNumber(metrics['metrics/mAP50-95(B)']),
    };

    const args = response.training_args || {};
    const trainingArgs: TrainingArgs = {
      imageSize: parseNumber(args['imgsz']),
      optimizer: args['optimizer'] ?? null,
      nbs: parseNumber(args['nbs']),
      iou: parseNumber(args['iou']),
      cls: parseNumber(args['cls']),
      dfl: parseNumber(args['dfl']),
      lr0: parseNumber(args['lr0']),
      lrf: parseNumber(args['lrf']),
      box: parseNumber(args['box']),
    };

    return {
      id: response.id,
      version: response.version,
      trainedAt: formatRelativeTime(response.trained_at),
      trainingMetrics: trainingMetrics,
      trainingArgs: trainingArgs,
      modelId: response.ml_model,
    };
  }
}
