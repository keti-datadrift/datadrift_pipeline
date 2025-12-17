import { Check, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Check, Loader2 } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

interface TrainingStatusPanelProps {
  isTraining: boolean;
  trainingProgress: number;
  currentEpoch: number;
  totalEpochs: number;
  trainingLoss: number | null;
}

export function TrainingStatusPanel({
  isTraining,
  trainingProgress,
  currentEpoch,
  totalEpochs,
  trainingLoss,
}: TrainingStatusPanelProps) {
  const { t } = useI18n();
  // Show progress info not only while training, but also after it finished.
  // Only hide progress area before any training ever started.
  const hasHistory =
    totalEpochs > 0 ||
    currentEpoch > 0 ||
    trainingLoss !== null ||
    trainingProgress > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            {isTraining ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Check className="size-5" />
            )}
            {t('training.status.title')}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {isTraining || hasHistory ? (
            <>
              <Progress value={trainingProgress} max={100} />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">{t('training.status.currentEpoch')}</span>
                  <p className="text-muted-foreground">
                    {currentEpoch}/{totalEpochs}
                  </p>
                </div>
                <div>
                  <span className="font-medium">{t('training.status.trainingLoss')}</span>
                  <p className="text-muted-foreground">
                    {trainingLoss ? trainingLoss.toFixed(4) : t('training.status.na')}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="text-gray-500 text-xs">
              <div>{t('training.status.progressWillBeDisplayed')}</div>
              <div>{t('training.status.clickStart')}</div>
            </div>
          )}

          {isTraining && <Button>{t('training.status.stopTraining')}</Button>}
        </div>
      </CardContent>
    </Card>
  );
}
