import {
  BackgroundTask,
  BackgroundTaskConfig,
  BackgroundTaskManager,
  BackgroundTaskStatus,
  BackgroundTaskType,
  StreamingTaskExecutor,
  TaskExecutor,
} from './types';

export class DefaultBackgroundTaskManager implements BackgroundTaskManager {
  private tasks = new Map<string, BackgroundTask>();
  private abortControllers = new Map<string, AbortController>();
  private listeners = new Set<() => void>();

  startTask = async <TResult = any>(
    config: BackgroundTaskConfig<any, TResult>,
    executor: TaskExecutor<TResult>,
  ): Promise<void> => {
    // Check if task already exists
    const existingTask = this.tasks.get(config.id);
    if (existingTask) {
      // If existing task is still running, cancel it first
      if (
        existingTask.status === BackgroundTaskStatus.RUNNING ||
        existingTask.status === BackgroundTaskStatus.PENDING
      ) {
        console.warn(`Cancelling existing task ${config.id} to start new one`);
        this.cancelTask(config.id);
      }
      // Remove the existing task to allow starting a new one
      this.tasks.delete(config.id);
    }

    const task: BackgroundTask = {
      id: config.id,
      type: config.type,
      status: BackgroundTaskStatus.PENDING,
      title: config.title,
      description: config.description,
      startedAt: new Date(),
      metadata: config.metadata,
    };

    this.tasks.set(config.id, task);
    this.notifyListeners();

    const abortController = new AbortController();
    this.abortControllers.set(config.id, abortController);

    try {
      // Notify executor that task is starting
      executor.onStart?.();
      this.updateTaskStatus(config.id, BackgroundTaskStatus.RUNNING);

      const resultOrGenerator = executor.execute();

      const isAsyncIterable =
        typeof (resultOrGenerator as any)?.[Symbol.asyncIterator] ===
        'function';

      if (isAsyncIterable) {
        // Delegate streaming execution to the executor
        await this.handleStreamingExecution(
          config,
          executor as StreamingTaskExecutor,
          resultOrGenerator as AsyncGenerator<any, TResult, unknown>,
          abortController,
        );
      } else {
        // Delegate promise-based execution to the executor
        await this.handlePromiseExecution(
          config,
          executor,
          resultOrGenerator as Promise<TResult>,
        );
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.failTask(config.id, errorMessage);
        executor.onError?.(errorMessage);
        config.onError?.(errorMessage);
      }
    } finally {
      this.abortControllers.delete(config.id);
    }
  };

  private async handleStreamingExecution<TResult>(
    config: BackgroundTaskConfig<any, TResult>,
    executor: StreamingTaskExecutor,
    generator: AsyncGenerator<any, TResult, unknown>,
    abortController: AbortController,
  ): Promise<void> {
    for await (const event of generator) {
      if (abortController.signal.aborted) {
        this.updateTaskStatus(config.id, BackgroundTaskStatus.CANCELLED);
        executor.onCancel?.();
        break;
      }

      try {
        const parsedData = executor.parseEvent
          ? executor.parseEvent(event)
          : event;
        if (parsedData == null) continue;

        const progress = executor.extractProgress?.(parsedData);
        if (progress) {
          this.updateTaskProgress(config.id, progress);
          config.onProgress?.(progress);
        }

        const status = executor.extractStatus?.(parsedData);
        if (status) {
          this.updateTaskStatus(config.id, status);

          if (status === BackgroundTaskStatus.COMPLETED) {
            this.completeTask(config.id);
            executor.onComplete?.(parsedData as TResult);
            config.onComplete?.(parsedData as TResult);
            break;
          } else if (status === BackgroundTaskStatus.FAILED) {
            const error = executor.extractError?.(parsedData) || 'Task failed';
            this.failTask(config.id, error);
            executor.onError?.(error);
            config.onError?.(error);
            break;
          }
        }
      } catch (parseError) {
        console.warn(
          `Failed to handle streamed event for task ${config.id}:`,
          parseError,
        );
      }
    }
  }

  private async handlePromiseExecution<TResult>(
    config: BackgroundTaskConfig<any, TResult>,
    executor: TaskExecutor<TResult>,
    promise: Promise<TResult>,
  ): Promise<void> {
    const result = await promise;
    // If the task was cancelled while the promise was resolving, don't mark as completed
    const task = this.tasks.get(config.id);
    if (task?.status === BackgroundTaskStatus.CANCELLED) {
      executor.onCancel?.();
      return;
    }
    this.completeTask(config.id);
    executor.onComplete?.(result);
    config.onComplete?.(result);
  }

  cancelTask = (taskId: string): void => {
    const abortController = this.abortControllers.get(taskId);
    if (abortController) {
      abortController.abort();
      this.updateTaskStatus(taskId, BackgroundTaskStatus.CANCELLED);
    }
  };

  getTask = (taskId: string): BackgroundTask | null => {
    return this.tasks.get(taskId) || null;
  };

  getAllTasks = (): BackgroundTask[] => {
    return Array.from(this.tasks.values()).sort(
      (a, b) => b.startedAt.getTime() - a.startedAt.getTime(),
    );
  };

  getTasksByType = (type: BackgroundTaskType): BackgroundTask[] => {
    return this.getAllTasks().filter((task) => task.type === type);
  };

  getRunningTasks = (): BackgroundTask[] => {
    return this.getAllTasks().filter(
      (task) =>
        task.status === BackgroundTaskStatus.RUNNING ||
        task.status === BackgroundTaskStatus.PENDING,
    );
  };

  clearCompletedTasks = (): void => {
    const completedTaskIds = Array.from(this.tasks.entries())
      .filter(
        ([, task]) =>
          task.status === BackgroundTaskStatus.COMPLETED ||
          task.status === BackgroundTaskStatus.FAILED ||
          task.status === BackgroundTaskStatus.CANCELLED,
      )
      .map(([id]) => id);

    completedTaskIds.forEach((id) => this.tasks.delete(id));
    this.notifyListeners();
  };

  clearAllTasks = (): void => {
    this.abortControllers.forEach((controller) => controller.abort());
    this.tasks.clear();
    this.abortControllers.clear();
    this.notifyListeners();
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private updateTask = (
    taskId: string,
    updates: Partial<BackgroundTask>,
  ): void => {
    const task = this.tasks.get(taskId);
    if (task) {
      this.tasks.set(taskId, { ...task, ...updates });
      this.notifyListeners();
    }
  };

  private updateTaskStatus = (
    taskId: string,
    status: BackgroundTaskStatus,
  ): void => {
    this.updateTask(taskId, { status });
  };

  private updateTaskProgress = (taskId: string, progress: any): void => {
    this.updateTask(taskId, { progress });
  };

  private completeTask = (taskId: string): void => {
    this.updateTask(taskId, {
      status: BackgroundTaskStatus.COMPLETED,
      completedAt: new Date(),
    });
  };

  private failTask = (taskId: string, error: string): void => {
    this.updateTask(taskId, {
      status: BackgroundTaskStatus.FAILED,
      completedAt: new Date(),
      error,
    });
  };

  private notifyListeners = (): void => {
    this.listeners.forEach((listener) => listener());
  };
}

export const DefaultBackgroundTask = new DefaultBackgroundTaskManager();
