'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DownloadIcon, Edit3Icon, Ellipsis, Trash2Icon } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

export function ProjectCardDropdown({
  projectId,
  onEditAction,
  onExportAction,
}: {
  projectId: string;
  onEditAction?: () => void;
  onExportAction?: () => void;
}) {
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          data-testid={`project-card-menu-${projectId}`}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onEditAction?.();
          }}
        >
          <Edit3Icon className="mr-2 h-4 w-4" />
          {t('common.edit')}
        </DropdownMenuItem>
        {/*<DropdownMenuItem*/}
        {/*  onClick={(e) => {*/}
        {/*    e.stopPropagation();*/}
        {/*    console.log('Duplicate');*/}
        {/*  }}*/}
        {/*>*/}
        {/*  <CopyPlusIcon className="mr-2 h-4 w-4" />*/}
        {/*  Duplicate*/}
        {/*</DropdownMenuItem>*/}
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onExportAction?.();
          }}
        >
          <DownloadIcon className="mr-2 h-4 w-4" />
          {t('common.download')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            console.log('Delete');
          }}
          variant="destructive"
        >
          <Trash2Icon className="mr-2 h-4 w-4" />
          {t('common.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
