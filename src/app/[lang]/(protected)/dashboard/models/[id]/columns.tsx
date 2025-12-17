import { Button } from '@/components/ui/button';
import { ModelVersion } from '@/entities/ml-model';
import { cn } from '@/utils/tailwind.util';
import { ColumnDef, Row } from '@tanstack/react-table';
import { Check, Copy, MoreHorizontal, Trash2 } from 'lucide-react';
import { memo, useCallback } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/contexts/I18nContext';
import { ModelVersion } from '@/entities/ml-model';

const SelectHeader = memo(() => {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center" aria-label={t('common.selectVersionHeader')}>
      <Check className="w-4 h-4" />
    </div>
  );
});
SelectHeader.displayName = 'SelectHeader';

const VersionActionsCell = memo(
  ({
    row,
    onDelete,
    onFork,
  }: {
    row: Row<ModelVersion>;
    onDelete: (versionId: number) => void;
    onFork: (versionId: number) => void;
  }) => {
    const { t } = useI18n();
    const version = row.original;

    const handleDeleteClick = useCallback(
      (event: React.MouseEvent) => {
        event.stopPropagation();
        onDelete(version.id);
      },
      [onDelete, version.id],
    );

    const handleForkClick = useCallback(
      (event: React.MouseEvent) => {
        event.stopPropagation();
        onFork(version.id);
      },
      [onFork, version.id],
    );

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="size-8 p-0">
            <span className="sr-only">{t('models.actions.openMenu')}</span>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="default"
            className="flex items-center gap-2"
            onClick={handleForkClick}
          >
            <Copy className="size-4" />
            {t('models.actions.forkVersion')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            className="flex items-center gap-2"
            onClick={handleDeleteClick}
          >
            <Trash2 className="size-4" />
            {t('models.actions.deleteVersion')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
);
VersionActionsCell.displayName = 'VersionActionsCell';

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
  onVersionDelete: (versionId: number) => void,
  onVersionFork: (versionId: number) => void,
): ColumnDef<ModelVersion>[] => [
  {
    id: 'version',
    header: () => {
      const VersionHeader = () => {
        const { t } = useI18n();
        return <>{t('models.columns.version')}</>;
      };
      return <VersionHeader />;
    },
    cell: ({ row }) => <VersionCell row={row} />,
    size: 80,
    minSize: 80,
    maxSize: 80,
  },
  {
    id: 'epochs',
    header: () => {
      const EpochsHeader = () => {
        const { t } = useI18n();
        return <>{t('modelDetail.columns.epochs')}</>;
      };
      return <EpochsHeader />;
    },
    cell: ({ row }) => (
      <MetricsCell metric={row.original.trainingMetrics.epochs} />
    ),
    size: 80,
    minSize: 80,
    maxSize: 80,
  },
  {
    id: 'trainingTime',
    header: () => {
      const TrainingTimeHeader = () => {
        const { t } = useI18n();
        return <>{t('modelDetail.columns.trainingTime')}</>;
      };
      return <TrainingTimeHeader />;
    },
    cell: ({ row }) => (
      <MetricsCell metric={row.original.trainingMetrics.trainingTime} />
    ),
    size: 120,
    minSize: 120,
    maxSize: 120,
  },
  {
    id: 'precision',
    header: () => {
      const PrecisionHeader = () => {
        const { t } = useI18n();
        return <>{t('modelDetail.columns.precision')}</>;
      };
      return <PrecisionHeader />;
    },
    cell: ({ row }) => (
      <MetricsCell metric={row.original.trainingMetrics.precision} />
    ),
    size: 90,
    minSize: 90,
    maxSize: 90,
  },
  {
    id: 'recall',
    header: () => {
      const RecallHeader = () => {
        const { t } = useI18n();
        return <>{t('modelDetail.columns.recall')}</>;
      };
      return <RecallHeader />;
    },
    cell: ({ row }) => (
      <MetricsCell metric={row.original.trainingMetrics.recall} />
    ),
    size: 80,
    minSize: 80,
    maxSize: 80,
  },
  {
    id: 'map50',
    header: () => {
      const Map50Header = () => {
        const { t } = useI18n();
        return <>{t('modelDetail.columns.map50')}</>;
      };
      return <Map50Header />;
    },
    cell: ({ row }) => (
      <MetricsCell metric={row.original.trainingMetrics.map50} />
    ),
    size: 80,
    minSize: 80,
    maxSize: 80,
  },
  {
    id: 'map5095',
    header: () => {
      const Map50Header = () => {
        const { t } = useI18n();
        return <>{t('modelDetail.columns.map5095')}</>;
      };
      return <Map50Header />;
    },
    cell: ({ row }) => (
      <MetricsCell metric={row.original.trainingMetrics.map50to95} />
    ),
    size: 100,
    minSize: 100,
    maxSize: 100,
  },
  {
    accessorKey: 'trainedAt',
    header: () => {
      const LastUpdateHeader = () => {
        const { t } = useI18n();
        return <>{t('models.columns.lastUpdate')}</>;
      };
      return <LastUpdateHeader />;
    },
    cell: ({ row }) => <TrainedAtCell row={row} />,
    size: 150,
    minSize: 150,
    maxSize: 150,
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <VersionActionsCell
        row={row}
        onDelete={onVersionDelete}
        onFork={onVersionFork}
      />
    ),
    size: 60,
    minSize: 60,
    maxSize: 60,
  },
];
