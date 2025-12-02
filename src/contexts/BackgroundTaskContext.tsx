'use client';

import { DefaultBackgroundTask } from '@/lib/background-tasks/manager';
import {
  BackgroundTask,
  BackgroundTaskConfig,
  BackgroundTaskStatus,
  BackgroundTaskType,
  TaskExecutor,
} from '@/lib/background-tasks/types';
import { createContext, useContext, useEffect, useState } from 'react';

interface BackgroundTaskContextType {
  tasks: BackgroundTask[];
  runningTasks: BackgroundTask[];
  startTask: <T>(
    config: BackgroundTaskConfig,
    executor: TaskExecutor<T>,
  ) => Promise<void>;
  cancelTask: (taskId: string) => void;
  getTask: (taskId: string) => BackgroundTask | null;
  getTasksByType: (type: BackgroundTaskType) => BackgroundTask[];
  clearCompletedTasks: () => void;
  clearAllTasks: () => void;
}

const BackgroundTaskContext = createContext<BackgroundTaskContextType | null>(
  null,
);

export function BackgroundTaskProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);

  useEffect(() => {
    const updateTasks = () => {
      setTasks(DefaultBackgroundTask.getAllTasks());
    };

    const unsubscribe = DefaultBackgroundTask.subscribe(updateTasks);
    updateTasks();

    return unsubscribe;
  }, []);

  const runningTasks = tasks.filter(
    (task) =>
      task.status === BackgroundTaskStatus.RUNNING ||
      task.status === BackgroundTaskStatus.PENDING,
  );

  const contextValue: BackgroundTaskContextType = {
    tasks,
    runningTasks,
    startTask: DefaultBackgroundTask.startTask,
    cancelTask: DefaultBackgroundTask.cancelTask,
    getTask: DefaultBackgroundTask.getTask,
    getTasksByType: DefaultBackgroundTask.getTasksByType,
    clearCompletedTasks: DefaultBackgroundTask.clearCompletedTasks,
    clearAllTasks: DefaultBackgroundTask.clearAllTasks,
  };

  return (
    <BackgroundTaskContext.Provider value={contextValue}>
      {children}
    </BackgroundTaskContext.Provider>
  );
}

export function useBackgroundTasks(): BackgroundTaskContextType {
  const context = useContext(BackgroundTaskContext);
  if (!context) {
    throw new Error(
      'useBackgroundTasks must be used within a BackgroundTaskProvider',
    );
  }
  return context;
}
