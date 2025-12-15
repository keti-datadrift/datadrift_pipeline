import ModelTypeBadge from '@/components/model-type-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Model, ModelType } from '@/entities/ml-model';
import { ColumnDef } from '@tanstack/react-table';
import {
  ArrowUpDown,
  Filter,
  Info,
  MoreHorizontal,
  Tag,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useI18n } from '@/contexts/I18nContext';

// Component to handle type filtering
const TypeFilterCell = ({ column }: { column: any }) => {
  const { t } = useI18n();
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const handleTypeToggle = (type: string) => {
    const newSelectedTypes = selectedTypes.includes(type)
      ? selectedTypes.filter((t) => t !== type)
      : [...selectedTypes, type];

    setSelectedTypes(newSelectedTypes);

    // Apply filter to column
    if (newSelectedTypes.length === 0) {
      column.setFilterValue(undefined);
    } else {
      column.setFilterValue(newSelectedTypes);
    }
  };

  const clearFilters = () => {
    setSelectedTypes([]);
    column.setFilterValue(undefined);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-2">
          {t('models.filters.type')}
          {selectedTypes.length > 0 ? (
            <Filter className="size-4 text-blue-600" />
          ) : (
            <Tag className="size-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <div className="p-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{t('models.filters.filterByType')}</span>
            {selectedTypes.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-6 px-2 text-xs"
              >
                {t('models.filters.clear')}
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {ModelType.allCases().map((type) => (
              <div key={type} className="flex items-center space-x-2">
                <Checkbox
                  id={type}
                  checked={selectedTypes.includes(type)}
                  onCheckedChange={() => handleTypeToggle(type)}
                />
                <label htmlFor={type} className="cursor-pointer flex-1">
                  <ModelTypeBadge type={type} />
                </label>
              </div>
            ))}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// Component to handle actions, including router usage
const ModelActionsCell = ({ model }: { model: Model }) => {
  const router = useRouter();
  const { t } = useI18n();

  const handleDetailClick = () => {
    router.push(`/dashboard/models/${model.id}`);
  };

  const handleDeleteClick = () => {
    throw new Error('Delete model');
  };

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
          onClick={handleDetailClick}
        >
          <Info className="size-4" />
          {t('models.actions.viewDetails')}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="default"
          className="flex items-center gap-2"
          onClick={handleTrainClick}
        >
          <Play className="size-4" />
          {t('models.actions.trainThisModel')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          className="flex items-center gap-2"
          onClick={handleDeleteClick}
        >
          <Trash2 className="size-4" />
          {t('models.actions.deleteModel')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const columns: ColumnDef<Model>[] = [
  {
    accessorKey: 'id',
    header: ({ column }) => {
      const IdHeader = ({ column }: { column: any }) => {
        const { t } = useI18n();
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {t('models.columns.id')}
            <ArrowUpDown className="ml-2 size-4" />
          </Button>
        );
      };
      return <IdHeader column={column} />;
    },
    cell: ({ row }) => {
      const id = row.getValue('id') as Model['id'];
      return <div className="ml-4 truncate">{id}</div>;
    },
    size: 80,
    minSize: 80,
    maxSize: 80,
  },
  {
    accessorKey: 'name',
    header: () => {
      const NameHeader = () => {
        const { t } = useI18n();
        return <>{t('models.columns.modelName')}</>;
      };
      return <NameHeader />;
    },
    cell: ({ row }) => (
      <div className="font-medium truncate" title={row.original.name}>
        {row.original.name}
      </div>
    ),
    size: 250,
    minSize: 250,
    maxSize: 250,
  },
  {
    accessorKey: 'type',
    header: ({ column }) => <TypeFilterCell column={column} />,
    cell: ({ row }) => <ModelTypeBadge type={row.original.type} />,
    filterFn: (row, id, value) => {
      if (!value || value.length === 0) return true;
      return value.includes(row.getValue(id));
    },
    size: 120,
    minSize: 120,
    maxSize: 120,
  },
  {
    accessorKey: 'version',
    header: () => {
      const VersionHeader = () => {
        const { t } = useI18n();
        return <>{t('models.columns.version')}</>;
      };
      return <VersionHeader />;
    },
    cell: ({ row }) => (
      <div
        className="font-mono text-sm truncate"
        title={`v${row.getValue('version')}`}
      >
        v{row.getValue('version')}
      </div>
    ),
    size: 100,
    minSize: 100,
    maxSize: 100,
  },
  {
    accessorKey: 'updatedAt',
    header: () => {
      const LastUpdateHeader = () => {
        const { t } = useI18n();
        return <>{t('models.columns.lastUpdate')}</>;
      };
      return <LastUpdateHeader />;
    },
    cell: ({ row }) => (
      <div className="truncate" title={row.getValue('updatedAt')}>
        {row.getValue('updatedAt')}
      </div>
    ),
    size: 150,
    minSize: 150,
    maxSize: 150,
  },
  {
    id: 'actions',
    cell: ({ row }) => <ModelActionsCell model={row.original} />,
    size: 60,
    minSize: 60,
    maxSize: 60,
  },
];
