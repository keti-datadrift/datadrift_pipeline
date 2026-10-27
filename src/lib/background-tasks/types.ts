// Predefined task types for common use cases
export const TASK_TYPES = {
  TRAINING: 'training',
  DATA_PROCESSING: 'data_processing',
  MODEL_INFERENCE: 'model_inference',
  EXPORT: 'export',
  IMPORT: 'import',
} as const;

// Flexible task type that allows custom types
export type BackgroundTaskType = keyof typeof TASK_TYPES | (string & {});

export enum BackgroundTaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// Base progress interface
export interface BaseProgress {
  message?: string;
  metadata?: Record<string, any>;
}

// Numeric progress (e.g., training epochs, file processing)
export interface NumericProgress extends BaseProgress {
  type: 'numeric';
  current: number;
  total: number;
  percentage: number;
}

// Stage-based progress (e.g., multi-step workflows)
export interface StageProgress extends BaseProgress {
  type: 'stage';
  currentStage: string;
  totalStages: number;
  stageIndex: number;
  stageProgress?: number; // 0-100 percentage within current stage
}

// Indeterminate progress (e.g., waiting for external service)
export interface IndeterminateProgress extends BaseProgress {
  type: 'indeterminate';
  activity: string;
}

// Union type for all progress patterns
export type BackgroundTaskProgress =
  | NumericProgress
  | StageProgress
  | IndeterminateProgress;

export interface BackgroundTask<TMetadata = Record<string, any>> {
  id: string;
  type: BackgroundTaskType;
  status: BackgroundTaskStatus;
  title: string;
  description?: string;
  progress?: BackgroundTaskProgress;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  metadata?: TMetadata;
}

export interface BackgroundTaskConfig<
  TMetadata = Record<string, any>,
  TResult = any,
> {
  id: string;
  type: BackgroundTaskType;
  title: string;
  description?: string;
  metadata?: TMetadata;
  onProgress?: (progress: BackgroundTaskProgress) => void;
  onComplete?: (result?: TResult) => void;
  onError?: (error: string) => void;
}

// Base task executor interface
export interface TaskExecutor<TResult = any> {
  execute(): Promise<TResult> | AsyncGenerator<any, TResult, unknown>;

  // Called when task execution starts
  onStart?(): void;

  // Called when task execution completes successfully
  onComplete?(result: TResult): void;

  // Called when task execution fails
  onError?(error: string): void;

  // Called when task is cancelled
  onCancel?(): void;
}

// Promise-based executor for simple async tasks
export interface PromiseTaskExecutor<TResult = any>
  extends TaskExecutor<TResult> {
  execute(): Promise<TResult>;
}

// Streaming executor for tasks that emit progress events (e.g., SSE)
export interface StreamingTaskExecutor<TData = any, TResult = any>
  extends TaskExecutor<TResult> {
  execute(): AsyncGenerator<TData, TResult, unknown>;

  // Parse raw event data into structured data
  parseEvent?(event: any): TData | null;

  // Extract progress information from parsed data
  extractProgress?(data: TData): BackgroundTaskProgress | null;

  // Extract status information from parsed data
  extractStatus?(data: TData): BackgroundTaskStatus | null;

  // Extract error information from parsed data
  extractError?(data: TData): string | null;
}

// SSE-specific executor (alias for backwards compatibility)
export interface SSETaskExecutor<TData = any, TResult = any>
  extends StreamingTaskExecutor<TData, TResult> {}

// Note: Promise-based executors can be modeled with TaskExecutor where execute() returns a Promise<TResult>.

export interface BackgroundTaskManager {
  // Start a background task with a generic executor (SSE/AsyncGenerator or Promise)
  startTask: <TResult, TMetadata = Record<string, any>>(
    config: BackgroundTaskConfig<TMetadata, TResult>,
    executor: TaskExecutor<TResult>,
  ) => Promise<void>;

  cancelTask: (taskId: string) => void;
  getTask: (taskId: string) => BackgroundTask | null;
  getAllTasks: () => BackgroundTask[];
  getTasksByType: (type: BackgroundTaskType) => BackgroundTask[];
  getRunningTasks: () => BackgroundTask[];
  clearCompletedTasks: () => void;
  clearAllTasks: () => void;
}
