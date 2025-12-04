import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ColumnDef,
  ColumnFiltersState,
  OnChangeFn,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { memo, useCallback, useMemo, useState } from 'react';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  columnFilters?: ColumnFiltersState;
  onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>;
}

export const DataTable = memo(
  <TData, TValue>({
    columns,
    data,
    columnFilters = [],
    onColumnFiltersChange,
  }: DataTableProps<TData, TValue>) => {
    const [sorting, setSorting] = useState<SortingState>([]);

    const memoizedSorting = useMemo(() => sorting, [sorting]);
    const memoizedColumnFilters = useMemo(() => columnFilters, [columnFilters]);

    const handleSortingChange = useCallback((updater: any) => {
      setSorting(updater);
    }, []);

    const table = useReactTable({
      data,
      columns,
      getCoreRowModel: getCoreRowModel(),
      getPaginationRowModel: getPaginationRowModel(),
      onSortingChange: handleSortingChange,
      getSortedRowModel: getSortedRowModel(),
      onColumnFiltersChange,
      getFilteredRowModel: getFilteredRowModel(),
      enableRowSelection: false,
      enableMultiRowSelection: false,
      state: {
        sorting: memoizedSorting,
        columnFilters: memoizedColumnFilters,
      },
    });

    const headerGroups = useMemo(() => table.getHeaderGroups(), [table]);
    const rows = useMemo(() => table.getRowModel().rows, [table]);

    return (
      <div>
        <div className="rounded-md border">
          <Table style={{ tableLayout: 'fixed', width: '100%' }}>
            <TableHeader>
              {headerGroups.map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={`py-3 ${header.column.columnDef.header === 'Version' ? 'text-left' : 'text-center'} text-gray-500`}
                      style={{
                        width: header.column.columnDef.size,
                        minWidth: header.column.columnDef.minSize,
                        maxWidth: header.column.columnDef.maxSize,
                      }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows?.length ? (
                rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    className="hover:bg-gray-50 transition-colors h-16"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={`py-2 ${cell.column.columnDef.header === 'Version' ? 'text-left' : 'text-center'}`}
                        style={{
                          width: cell.column.columnDef.size,
                          minWidth: cell.column.columnDef.minSize,
                          maxWidth: cell.column.columnDef.maxSize,
                        }}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No model found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  },
);
DataTable.displayName = 'DataTable';
