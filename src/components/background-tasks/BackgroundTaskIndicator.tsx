'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { useBackgroundTasks } from '@/contexts/BackgroundTaskContext';
import { BackgroundTaskStatus } from '@/lib/background-tasks/types';
import { Bell, CheckCircle, Loader2, X, XCircle } from 'lucide-react';

export function BackgroundTaskIndicator() {
  const { tasks, runningTasks, cancelTask, clearCompletedTasks } =
    useBackgroundTasks();

  const completedTasks = tasks.filter(
    (task) => task.status === BackgroundTaskStatus.COMPLETED,
  );

  const failedTasks = tasks.filter(
    (task) => task.status === BackgroundTaskStatus.FAILED,
  );

  const hasActiveTasks = runningTasks.length > 0;
  const hasNotifications = completedTasks.length > 0 || failedTasks.length > 0;

  const getStatusIcon = (status: BackgroundTaskStatus) => {
    switch (status) {
      case BackgroundTaskStatus.RUNNING:
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case BackgroundTaskStatus.PENDING:
        return <Loader2 className="h-4 w-4 text-yellow-500" />;
      case BackgroundTaskStatus.COMPLETED:
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case BackgroundTaskStatus.FAILED:
        return <XCircle className="h-4 w-4 text-red-500" />;
      case BackgroundTaskStatus.CANCELLED:
        return <X className="h-4 w-4 text-gray-500" />;
      default:
        return <Loader2 className="h-4 w-4" />;
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-4 w-4" />
          {(hasActiveTasks || hasNotifications) && (
            <span
              className={`absolute -top-1 -right-1 h-3 w-3 rounded-full ${
                hasActiveTasks ? 'bg-blue-500' : 'bg-green-500'
              }`}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Tasks</h4>
            {(completedTasks.length > 0 || failedTasks.length > 0) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearCompletedTasks}
                className="text-xs"
              >
                Clear completed
              </Button>
            )}
          </div>

          {tasks.length === 0 && (
            <p className="text-sm text-muted-foreground">No tasks</p>
          )}

          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(task.status)}
                    <span className="text-sm font-medium">{task.title}</span>
                    <Badge variant="outline" className="text-xs">
                      {task.type}
                    </Badge>
                  </div>
                  {(task.status === BackgroundTaskStatus.RUNNING ||
                    task.status === BackgroundTaskStatus.PENDING) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancelTask(task.id)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                {task.description && (
                  <p className="text-xs text-muted-foreground">
                    {task.description}
                  </p>
                )}

                {task.progress && (
                  <div className="space-y-1">
                    {task.progress.type === 'numeric' ? (
                      <>
                        <Progress
                          value={task.progress.percentage}
                          className="h-2"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>
                            {task.progress.message || 'Processing...'}
                          </span>
                          <span>{Math.round(task.progress.percentage)}%</span>
                        </div>
                      </>
                    ) : task.progress.type === 'stage' ? (
                      <>
                        <Progress
                          value={
                            typeof task.progress.stageProgress === 'number'
                              ? task.progress.stageProgress
                              : (task.progress.stageIndex /
                                  task.progress.totalStages) *
                                100
                          }
                          className="h-2"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>
                            {task.progress.message ||
                              `Stage ${task.progress.stageIndex + 1}/${task.progress.totalStages}: ${task.progress.currentStage}`}
                          </span>
                          <span>
                            {typeof task.progress.stageProgress === 'number'
                              ? `${Math.round(task.progress.stageProgress)}%`
                              : `${Math.round((task.progress.stageIndex / task.progress.totalStages) * 100)}%`}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>
                            {task.progress.message ||
                              // activity exists on indeterminate progress
                              (task.progress as any).activity ||
                              'Working...'}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {task.error && (
                  <p className="text-xs text-red-500">{task.error}</p>
                )}

                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Started: {task.startedAt.toLocaleTimeString()}</span>
                  {task.completedAt && (
                    <span>
                      Completed: {task.completedAt.toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
