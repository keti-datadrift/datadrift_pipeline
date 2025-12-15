'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useI18n } from '@/contexts/I18nContext';
import { DefaultModelVersion } from '@/entities/ml-model';
import type { VersionMetric } from '@/hooks/use-default-models';

type VersionDetailsProps = {
  selectedVersion: DefaultModelVersion | null;
  versionMetrics: VersionMetric[];
  isSelectedVersionDefault: boolean;
  updateStatus: 'idle' | 'loading' | 'success' | 'error';
  updateMessage: string | null;
  onUpdateDefaultAction: () => void;
};

export function VersionDetails({
  selectedVersion,
  versionMetrics,
  isSelectedVersionDefault,
  updateStatus,
  updateMessage,
  onUpdateDefaultAction,
}: VersionDetailsProps) {
  const { t } = useI18n();

  if (!selectedVersion) {
    return (
      <Card className="flex h-full min-h-0 w-full flex-col">
        <CardHeader>
          <CardTitle>{t('defaultModels.sections.details.title')}</CardTitle>
          <CardDescription>
            {t('defaultModels.sections.details.emptyDescription')}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const isLoadingUpdate = updateStatus === 'loading';

  return (
    <Card className="flex h-full min-h-0 w-full flex-col">
      <CardHeader className="shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              {selectedVersion.version}
              {isSelectedVersionDefault ? (
                <Badge variant="default">
                  {t('defaultModels.badges.currentDefault')}
                </Badge>
              ) : null}
            </CardTitle>
            <CardDescription>
              {t('defaultModels.text.trainedOn', {
                date: selectedVersion.trainedAt,
              })}
            </CardDescription>
          </div>
          <Button
            onClick={onUpdateDefaultAction}
            disabled={isSelectedVersionDefault || isLoadingUpdate}
          >
            {isSelectedVersionDefault
              ? t('defaultModels.buttons.alreadyDefault')
              : isLoadingUpdate
                ? t('defaultModels.buttons.updating')
                : t('defaultModels.buttons.setDefault')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-6">
        {updateStatus === 'success' && updateMessage ? (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>
              {t('defaultModels.alerts.updateSuccessTitle')}
            </AlertTitle>
            <AlertDescription>{updateMessage}</AlertDescription>
          </Alert>
        ) : null}
        {updateStatus === 'error' && updateMessage ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {t('defaultModels.alerts.updateErrorTitle')}
            </AlertTitle>
            <AlertDescription>{updateMessage}</AlertDescription>
          </Alert>
        ) : null}
        <div>
          <h3 className="text-sm font-semibold mb-3">
            {t('defaultModels.sections.details.metricsTitle')}
          </h3>
          <div className="space-y-3">
            {versionMetrics.map((metric) => {
              const metricLabel = t(`defaultModels.metrics.${metric.key}`);
              const metricValue =
                typeof metric.value === 'number'
                  ? metric.formatter
                    ? metric.formatter(metric.value)
                    : metric.value.toFixed(3)
                  : t('defaultModels.text.notAvailable');
              const progressValue =
                typeof metric.value === 'number'
                  ? Math.max(0, Math.min(100, metric.value * 100))
                  : 0;

              return (
                <div key={`progress-${metric.key}`}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{metricLabel}</span>
                    <span className="font-medium">{metricValue}</span>
                  </div>
                  <Progress value={progressValue} className="h-2" />
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
