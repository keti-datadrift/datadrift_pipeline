import { cn } from '@/lib/utils/tailwind.util';
import { Loader2, Play } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '../ui/button';

export function TrainButton({
  onClick,
  progress,
  disabled,
}: {
  onClick: () => void;
  progress?: boolean;
  disabled?: boolean;
}) {
  const isTraining = !!progress;

  const buttonTitle = useMemo(() => {
    return isTraining ? 'Training' : 'Start Training';
  }, [isTraining]);

  const icon = useMemo(() => {
    return isTraining ? (
      <Loader2 className="mr-2 size-4 animate-spin" />
    ) : (
      <Play className="mr-2 size-4 fill-primary-foreground" />
    );
  }, [isTraining]);

  return (
    <Button
      className={cn(
        'w-full h-12 rounded-xl font-medium',
        isTraining ? 'cursor-progress' : 'cursor-pointer',
      )}
      onClick={onClick}
      disabled={disabled || isTraining}
    >
      <div className="flex flex-row items-center gap-1">
        {icon}
        {buttonTitle}
      </div>
    </Button>
  );
}
