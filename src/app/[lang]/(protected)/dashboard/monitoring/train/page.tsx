'use client';

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  PlayCircle,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { StatCard } from '@/components/stat-card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useBackgroundTasks } from '@/contexts/BackgroundTaskContext';
import { useI18n } from '@/contexts/I18nContext';
import {
  BackgroundTask,
  BackgroundTaskStatus,
  TASK_TYPES,
} from '@/lib/background-tasks/types';
import { TrainingHistoryStorage } from '@/lib/training-history';

function getStatusIcon(status: BackgroundTaskStatus) {
  switch (status) {
    case BackgroundTaskStatus.RUNNING:
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case BackgroundTaskStatus.COMPLETED:
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case BackgroundTaskStatus.FAILED:
      return <XCircle className="h-4 w-4 text-red-500" />;
    case BackgroundTaskStatus.CANCELLED:
      return <XCircle className="h-4 w-4 text-gray-500" />;
    case BackgroundTaskStatus.PENDING:
      return <Clock className="h-4 w-4 text-yellow-500" />;
    default:
      return <Clock className="h-4 w-4 text-gray-500" />;
  }
}

function formatDuration(startedAt: Date, completedAt?: Date) {
  const end = completedAt || new Date();
  const duration = end.getTime() - startedAt.getTime();
  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

export default function MonitoringTrainPage() {
  const { tasks } = useBackgroundTasks();
  const { t } = useI18n();
  const [persistedHistory, setPersistedHistory] = useState<BackgroundTask[]>(
    () => TrainingHistoryStorage.getTrainingHistoryAsTasks(),
  );

  const currentTrainingTasks = useMemo(() => {
    return tasks.filter((task) => task.type === TASK_TYPES.TRAINING);
  }, [tasks]);

  useEffect(() => {
    const completedTasks = currentTrainingTasks.filter(
      (task) =>
        task.status === BackgroundTaskStatus.COMPLETED ||
        task.status === BackgroundTaskStatus.FAILED ||
        task.status === BackgroundTaskStatus.CANCELLED,
    );

    if (completedTasks.length > 0) {
      const rafId = requestAnimationFrame(() => {
        setPersistedHistory(TrainingHistoryStorage.getTrainingHistoryAsTasks());
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [currentTrainingTasks]);

  const allTrainingTasks = useMemo(() => {
    const currentTaskIds = new Set(currentTrainingTasks.map((task) => task.id));
    const completedPersistedTasks = persistedHistory.filter(
      (task) => !currentTaskIds.has(task.id),
    );

    return [...currentTrainingTasks, ...completedPersistedTasks];
  }, [currentTrainingTasks, persistedHistory]);

  const stats = useMemo(() => {
    const running = allTrainingTasks.filter(
      (task) => task.status === BackgroundTaskStatus.RUNNING,
    ).length;
    const completed = allTrainingTasks.filter(
      (task) => task.status === BackgroundTaskStatus.COMPLETED,
    ).length;
    const failed = allTrainingTasks.filter(
      (task) => task.status === BackgroundTaskStatus.FAILED,
    ).length;
    const pending = allTrainingTasks.filter(
      (task) => task.status === BackgroundTaskStatus.PENDING,
    ).length;

    return { running, completed, failed, pending };
  }, [allTrainingTasks]);

  const currentTraining = useMemo(() => {
    return allTrainingTasks.find(
      (task) => task.status === BackgroundTaskStatus.RUNNING,
    );
  }, [allTrainingTasks]);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          {t('monitoring.train.title')}
        </h1>
        <p className="text-sm text-gray-600">
          {t('monitoring.train.description')}
        </p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t('monitoring.train.stats.running.title')}
          description={t('monitoring.train.stats.running.description')}
          value={stats.running}
          icon={PlayCircle}
        />
        <StatCard
          title={t('monitoring.train.stats.completed.title')}
          description={t('monitoring.train.stats.completed.description')}
          value={stats.completed}
          icon={CheckCircle2}
        />
        <StatCard
          title={t('monitoring.train.stats.failed.title')}
          description={t('monitoring.train.stats.failed.description')}
          value={stats.failed}
          icon={XCircle}
        />
        <StatCard
          title={t('monitoring.train.stats.pending.title')}
          description={t('monitoring.train.stats.pending.description')}
          value={stats.pending}
          icon={Clock}
        />
      </div>

      {/* Current Training */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {t('monitoring.train.currentTraining.title')}
          </CardTitle>
          <CardDescription>
            {t('monitoring.train.currentTraining.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentTraining ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getStatusIcon(currentTraining.status)}
                  <span className="font-medium">{currentTraining.title}</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {formatDuration(currentTraining.startedAt)}
                </span>
              </div>

              {currentTraining.description && (
                <p className="text-sm text-muted-foreground">
                  {currentTraining.description}
                </p>
              )}

              {currentTraining.progress && (
                <div className="space-y-2">
                  {currentTraining.progress.type === 'numeric' && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span>
                          {t('monitoring.train.currentTraining.progress')}
                        </span>
                        <span>
                          {currentTraining.progress.current}/
                          {currentTraining.progress.total} (
                          {Math.round(currentTraining.progress.percentage)}
                          %)
                        </span>
                      </div>
                      <Progress
                        value={currentTraining.progress.percentage}
                        className="h-2"
                      />
                    </>
                  )}

                  {currentTraining.progress.type === 'stage' && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span>
                          {t('monitoring.train.currentTraining.stage')}
                        </span>
                        <span>
                          {currentTraining.progress.stageIndex + 1}/
                          {currentTraining.progress.totalStages}
                        </span>
                      </div>
                      <div className="text-sm font-medium">
                        {currentTraining.progress.currentStage}
                      </div>
                      {currentTraining.progress.stageProgress && (
                        <Progress
                          value={currentTraining.progress.stageProgress}
                          className="h-2"
                        />
                      )}
                    </>
                  )}

                  {currentTraining.progress.type === 'indeterminate' && (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">
                        {currentTraining.progress.activity}
                      </span>
                    </div>
                  )}

                  {currentTraining.progress.message && (
                    <p className="text-xs text-muted-foreground">
                      {currentTraining.progress.message}
                    </p>
                  )}
                </div>
              )}

              {currentTraining.error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{currentTraining.error}</AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <div className="text-center">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>{t('monitoring.train.currentTraining.noActive')}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Training History */}
      <Card>
        <CardHeader>
          <CardTitle>{t('monitoring.train.history.title')}</CardTitle>
          <CardDescription>
            {t('monitoring.train.history.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {allTrainingTasks.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <div className="text-center">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>{t('monitoring.train.history.empty')}</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {t('monitoring.train.history.table.status')}
                  </TableHead>
                  <TableHead>
                    {t('monitoring.train.history.table.task')}
                  </TableHead>
                  <TableHead>
                    {t('monitoring.train.history.table.duration')}
                  </TableHead>
                  <TableHead>
                    {t('monitoring.train.history.table.progress')}
                  </TableHead>
                  <TableHead>
                    {t('monitoring.train.history.table.started')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allTrainingTasks
                  .sort(
                    (a, b) =>
                      new Date(b.startedAt).getTime() -
                      new Date(a.startedAt).getTime(),
                  )
                  .map((task) => (
                    <TableRow key={task.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(task.status)}
                          <span className="capitalize text-sm">
                            {task.status.toLowerCase()}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{task.title}</div>
                          {task.description && (
                            <div className="text-sm text-muted-foreground">
                              {task.description}
                            </div>
                          )}
                          {task.error && (
                            <div className="text-sm text-red-600 mt-1">
                              {task.error}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {formatDuration(task.startedAt, task.completedAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {task.status === BackgroundTaskStatus.RUNNING &&
                          task.progress?.type === 'numeric' && (
                            <div className="space-y-1">
                              <div className="text-sm">
                                {Math.round(task.progress.percentage)}%
                              </div>
                              <Progress
                                value={task.progress.percentage}
                                className="h-2 w-20"
                              />
                            </div>
                          )}
                        {task.status === BackgroundTaskStatus.RUNNING &&
                          task.progress?.type === 'stage' && (
                            <div className="text-sm">
                              Stage {task.progress.stageIndex + 1}/
                              {task.progress.totalStages}
                            </div>
                          )}
                        {task.status === BackgroundTaskStatus.RUNNING &&
                          task.progress?.type === 'indeterminate' && (
                            <div className="text-sm">
                              {task.progress.activity}
                            </div>
                          )}
                        {task.status !== BackgroundTaskStatus.RUNNING && (
                          <span className="text-sm text-muted-foreground">
                            -
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {new Date(task.startedAt).toLocaleString()}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
