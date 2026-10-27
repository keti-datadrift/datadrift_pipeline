import { PromiseTaskExecutor } from './types';

/**
 * Example implementation of a Promise-based executor for simple async tasks
 * that don't require streaming or real-time progress updates.
 */
export class SimplePromiseExecutor<TResult = any>
  implements PromiseTaskExecutor<TResult>
{
  constructor(private task: () => Promise<TResult>) {}

  execute(): Promise<TResult> {
    return this.task();
  }

  onStart?(): void {
    console.log('Promise-based task started');
  }

  onComplete?(result: TResult): void {
    console.log('Promise-based task completed:', result);
  }

  onError?(error: string): void {
    console.log('Promise-based task failed:', error);
  }

  onCancel?(): void {
    console.log('Promise-based task was cancelled');
  }
}

/**
 * Factory function to create a simple promise executor
 */
export const createPromiseExecutor = <TResult = any>(
  task: () => Promise<TResult>,
): SimplePromiseExecutor<TResult> => {
  return new SimplePromiseExecutor(task);
};
