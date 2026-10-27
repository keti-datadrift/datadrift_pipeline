import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ColumnDef } from '@tanstack/react-table';
import { Info, MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

export type Model = {
  id: string;
  name: string;
  type: 'layout' | 'ocrcls' | 'ocrrec' | 'ocrdet' | 'tabrec';
  version: string;
  updatedAt: string;
  description?: string;
};

const getTypeBadge = (type: Model['type']) => {
  switch (type) {
    case 'layout':
      return (
        <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">
          Layout Detection
        </Badge>
      );
    case 'ocrcls':
      return (
        <Badge className="bg-lime-100 text-lime-800 hover:bg-lime-200">
          OCR Classification
        </Badge>
      );
    case 'ocrrec':
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-200">
          OCR Recognition
        </Badge>
      );
    case 'ocrdet':
      return (
        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200">
          OCR Detection
        </Badge>
      );
    case 'tabrec':
      return (
        <Badge className="bg-indigo-100 text-indigo-800 hover:bg-indigo-200">
          Table
        </Badge>
      );
    default:
      return <Badge variant="secondary">{type}</Badge>;
  }
};

export const columns: ColumnDef<Model>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => {
      const id = row.getValue('id') as Model['id'];
      return id;
    },
  },
  {
    accessorKey: 'name',
    header: 'Model Name',
    cell: ({ row }) => {
      const name = row.getValue('name') as Model['name'];
      return <div className="font-medium">{name}</div>;
    },
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => {
      const type = row.getValue('type') as Model['type'];
      return <div className="font-medium">{getTypeBadge(type)}</div>;
    },
  },
  {
    accessorKey: 'version',
    header: 'Version',
    cell: ({ row }) => {
      const version = row.getValue('version') as Model['version'];
      return <div className="font-mono text-sm">v{version}</div>;
    },
  },
  {
    accessorKey: 'updatedAt',
    header: 'Last Update',
    cell: ({ row }) => {
      const updatedAt = row.getValue('updatedAt') as Model['updatedAt'];
      return updatedAt;
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const model = row.original;
      const router = useRouter();

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="size-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="default"
              className="flex items-center gap-2"
              onClick={() => router.push(`/models/${model.id}`)}
            >
              <Info className="size-4" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              className="flex items-center gap-2"
              onClick={() =>
                console.log('Attempting to delete model:', model.id)
              }
            >
              <Trash2 className="size-4" />
              Delete Model
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
