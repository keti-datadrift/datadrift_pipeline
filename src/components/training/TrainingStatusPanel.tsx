import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Check, Loader2 } from 'lucide-react';

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
  // Show progress info not only while training, but also after it finished.
  // Only hide progress area before any training ever started.
  const hasHistory =
    (typeof totalEpochs === 'number' && totalEpochs > 0) ||
    (typeof currentEpoch === 'number' && currentEpoch > 0) ||
    trainingLoss !== null ||
    (typeof trainingProgress === 'number' && trainingProgress > 0);

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
            Training Status
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
                  <span className="font-medium">Current Epoch:</span>
                  <p className="text-muted-foreground">
                    {currentEpoch}/{totalEpochs}
                  </p>
                </div>
                <div>
                  <span className="font-medium">Training Loss:</span>
                  <p className="text-muted-foreground">
                    {trainingLoss ? trainingLoss.toFixed(4) : 'N/A'}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="text-gray-500 text-xs">
              <div>Training progress will be displayed here.</div>
              <div>
                You can start training by clicking the &quot;Start
                Training&quot; button.
              </div>
            </div>
          )}

          {isTraining && <div>Stop Training</div>}
        </div>
      </CardContent>
    </Card>
  );
}
