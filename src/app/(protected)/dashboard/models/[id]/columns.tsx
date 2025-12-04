import { Button } from '@/components/ui/button';
import { ModelVersion } from '@/entities/ml-model';
import { cn } from '@/utils/tailwind.util';
import { ColumnDef, Row } from '@tanstack/react-table';
import { Check } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';

const SelectCell = memo(
  ({
    row,
    isSelected,
    onSelect,
    className,
  }: {
    row: Row<ModelVersion>;
    isSelected: boolean;
    onSelect: (version: string) => void;
    className?: string;
  }) => {
    const version = row.original.version;
    const [isHovered, setIsHovered] = useState(false);

    const handleSelect = useCallback(() => {
      onSelect(version);
    }, [onSelect, version]);

    const handlePointerEnter = useCallback(() => {
      setIsHovered(true);
    }, []);

    const handlePointerLeave = useCallback(() => {
      setIsHovered(false);
    }, []);

    const buttonClassName = useMemo(
      () =>
        cn(
          'h-8 w-8 p-0 transition-all duration-300 border-none outline-none focus:outline-none hover:scale-100 active:scale-100',
          isSelected ? 'rounded-md' : 'rounded-full cursor-pointer',
          isSelected
            ? ''
            : isHovered
              ? 'bg-gray-100 opacity-100'
              : 'bg-gray-50 opacity-50',
        ),
      [isSelected, isHovered],
    );

    const dotClassName = useMemo(
      () =>
        cn(
          'rounded-full bg-gray-400 transition-all duration-400 ease-in-out',
          isHovered ? 'h-3 w-3' : 'h-2 w-2',
        ),
      [isHovered],
    );

    return (
      <div className={className}>
        <Button
          variant="ghost"
          className={buttonClassName}
          onClick={handleSelect}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          aria-label="Select version button"
        >
          {isSelected ? (
            <Check className="size-5 text-teal-600 font-bold animate-in zoom-in-75 duration-400" />
          ) : (
            <div className={dotClassName} />
          )}
        </Button>
      </div>
    );
  },
);
SelectCell.displayName = 'SelectCell';

const SelectHeader = memo(() => (
  <div
    className="flex items-center justify-center"
    aria-label="Select version header"
  >
    <Check className="w-4 h-4" />
  </div>
));
SelectHeader.displayName = 'SelectHeader';

const VersionCell = memo(({ row }: { row: Row<ModelVersion> }) => {
  const version = row.original.version;
  return (
    <div className="font-mono text-sm truncate" title={`v${version}`}>
      v{version}
    </div>
  );
});
VersionCell.displayName = 'VersionCell';

const TrainedAtCell = memo(({ row }: { row: Row<ModelVersion> }) => {
  return (
    <div className="truncate" title={row.original.trainedAt}>
      {row.original.trainedAt}
    </div>
  );
});
TrainedAtCell.displayName = 'TrainedAtCell';

const MetricsCell = memo(({ metric }: { metric: number | null }) => {
  const value = metric ?? '-';
  return (
    <div className="truncate" title={String(value)}>
      {value}
    </div>
  );
});
MetricsCell.displayName = 'MetricsCell';

export const columns = (
  selectedVersion: string | null,
  onVersionSelect: (version: string) => void,
): ColumnDef<ModelVersion>[] => [
  {
    id: 'select',
    header: () => <SelectHeader />,
    cell: ({ row }) => (
      <SelectCell
        row={row}
        isSelected={selectedVersion === row.original.version}
        onSelect={onVersionSelect}
        className="flex justify-center-safe"
        aria-label="Select version cell"
      />
    ),
    size: 60,
    minSize: 60,
    maxSize: 60,
  },
  {
    header: 'Version',
    cell: ({ row }) => <VersionCell row={row} />,
    size: 100,
    minSize: 100,
    maxSize: 100,
  },
  {
    header: 'Epochs',
    cell: ({ row }) => (
      <MetricsCell metric={row.original.trainingMetrics.epochs} />
    ),
    size: 80,
    minSize: 80,
    maxSize: 80,
  },
  {
    header: 'Training Time',
    cell: ({ row }) => (
      <MetricsCell metric={row.original.trainingMetrics.trainingTime} />
    ),
    size: 120,
    minSize: 120,
    maxSize: 120,
  },
  {
    header: 'Precision',
    cell: ({ row }) => (
      <MetricsCell metric={row.original.trainingMetrics.precision} />
    ),
    size: 90,
    minSize: 90,
    maxSize: 90,
  },
  {
    header: 'Recall',
    cell: ({ row }) => (
      <MetricsCell metric={row.original.trainingMetrics.recall} />
    ),
    size: 80,
    minSize: 80,
    maxSize: 80,
  },
  {
    header: 'mAP50',
    cell: ({ row }) => (
      <MetricsCell metric={row.original.trainingMetrics.map50} />
    ),
    size: 80,
    minSize: 80,
    maxSize: 80,
  },
  {
    header: 'mAP50-95',
    cell: ({ row }) => (
      <MetricsCell metric={row.original.trainingMetrics.map50to95} />
    ),
    size: 100,
    minSize: 100,
    maxSize: 100,
  },
  {
    accessorKey: 'trainedAt',
    header: 'Trained At',
    cell: ({ row }) => <TrainedAtCell row={row} />,
    size: 150,
    minSize: 150,
    maxSize: 150,
  },
];
