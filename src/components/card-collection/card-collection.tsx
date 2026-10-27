'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/tailwind.util';
import { Card } from '@/components/ui/card';

// Types for the card collection
export interface CardCollectionItem {
  id: string | number;
  [key: string]: any;
}

export interface CardCollectionProps<T extends CardCollectionItem> {
  /** Array of data items to display */
  data: T[];
  /** Function to render each card */
  renderCard: (item: T, index: number) => React.ReactNode;
  /** Number of columns in grid layout */
  columns?: {
    /** Default columns */
    default: number;
    /** Columns on small screens */
    sm?: number;
    /** Columns on medium screens */
    md?: number;
    /** Columns on large screens */
    lg?: number;
    /** Columns on extra large screens */
    xl?: number;
    /** Columns on 2xl screens */
    '2xl'?: number;
  };
  /** Layout direction */
  direction?: 'horizontal' | 'vertical';
  /** Gap between cards */
  gap?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  /** Custom className for the container */
  className?: string;
  /** Loading state */
  loading?: boolean;
  /** Empty state content */
  emptyState?: React.ReactNode;
  /** Loading skeleton count */
  loadingCount?: number;
  /** Enable automatic responsive behavior */
  responsive?: boolean;
  /** Custom card wrapper component */
  cardWrapper?: React.ComponentType<{
    children: React.ReactNode;
    className?: string;
  }>;
  /** Animation settings */
  animate?: boolean;
  /** Virtualization for large datasets */
  virtualized?: boolean;
  /** Container height for virtualization */
  height?: number;
  /** Estimated item height for virtualization */
  itemHeight?: number;
}

// Default columns configuration
const DEFAULT_COLUMNS = {
  default: 1,
  sm: 2,
  md: 3,
  lg: 4,
  xl: 5,
  '2xl': 6,
} as const;

// Gap size mapping
const GAP_SIZES = {
  none: 'gap-0',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
} as const;

// Loading skeleton component
function CardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn('animate-pulse', className)}>
      <div className="p-6 space-y-4">
        <div className="h-4 bg-muted rounded w-3/4"></div>
        <div className="h-3 bg-muted rounded w-1/2"></div>
        <div className="space-y-2">
          <div className="h-2 bg-muted rounded"></div>
          <div className="h-2 bg-muted rounded w-5/6"></div>
        </div>
      </div>
    </Card>
  );
}

// Empty state component
function DefaultEmptyState() {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-muted p-3 mb-4">
        <svg
          className="h-6 w-6 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2 2v-5m16 0h-6M4 13h6"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">
        No items found
      </h3>
      <p className="text-sm text-muted-foreground">
        There are no items to display in this collection.
      </p>
    </div>
  );
}

// Virtualized list item component
function VirtualizedItem<T extends CardCollectionItem>({
  item,
  index,
  renderCard,
  style,
}: {
  item: T;
  index: number;
  renderCard: (item: T, index: number) => React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={style} className="p-1">
      {renderCard(item, index)}
    </div>
  );
}

// Main CardCollection component
export function CardCollection<T extends CardCollectionItem>({
  data,
  renderCard, // Client-side render function
  columns = DEFAULT_COLUMNS,
  direction = 'vertical',
  gap = 'md',
  className,
  loading = false,
  emptyState,
  loadingCount = 6,
  responsive: _responsive = true,
  cardWrapper: CardWrapper,
  animate = true,
  virtualized = false,
  height = 400,
  itemHeight = 200,
}: CardCollectionProps<T>) {
  // Generate column classes based on configuration
  const getColumnClasses = () => {
    const colClasses = [];

    if (columns.default) colClasses.push(`grid-cols-${columns.default}`);
    if (columns.sm) colClasses.push(`sm:grid-cols-${columns.sm}`);
    if (columns.md) colClasses.push(`md:grid-cols-${columns.md}`);
    if (columns.lg) colClasses.push(`lg:grid-cols-${columns.lg}`);
    if (columns.xl) colClasses.push(`xl:grid-cols-${columns.xl}`);
    if (columns['2xl']) colClasses.push(`2xl:grid-cols-${columns['2xl']}`);

    return colClasses.join(' ');
  };

  // Handle loading state
  if (loading) {
    const skeletonItems = Array.from({ length: loadingCount }, (_, i) => i);

    return (
      <div
        className={cn(
          'grid',
          direction === 'horizontal'
            ? 'grid-flow-col auto-cols-max overflow-x-auto'
            : getColumnClasses(),
          GAP_SIZES[gap],
          animate && 'transition-all duration-300 ease-in-out',
          className,
        )}
      >
        {skeletonItems.map((_, index) => (
          <CardSkeleton key={`skeleton-${index}`} />
        ))}
      </div>
    );
  }

  // Handle empty state
  if (!data || data.length === 0) {
    return (
      <div className={cn('w-full', className)}>
        {emptyState || <DefaultEmptyState />}
      </div>
    );
  }

  // Virtualized rendering for large datasets
  if (virtualized && data.length > 50) {
    return (
      <div className={cn('overflow-auto', className)} style={{ height }}>
        <div
          className="grid gap-4"
          style={{ minHeight: data.length * itemHeight }}
        >
          {data.map((item, index) => (
            <VirtualizedItem
              key={item.id}
              item={item}
              index={index}
              renderCard={renderCard}
            />
          ))}
        </div>
      </div>
    );
  }

  // Standard grid rendering
  const gridClasses = cn(
    'grid',
    direction === 'horizontal'
      ? 'grid-flow-col auto-cols-max overflow-x-auto'
      : getColumnClasses(),
    GAP_SIZES[gap],
    animate && 'transition-all duration-300 ease-in-out',
    className,
  );

  return (
    <div className={gridClasses}>
      {data.map((item, index) => {
        const cardContent = renderCard(item, index);

        return CardWrapper ? (
          <CardWrapper
            key={item.id}
            className={
              animate ? 'animate-in fade-in-0 duration-300' : undefined
            }
          >
            {cardContent}
          </CardWrapper>
        ) : (
          <div
            key={item.id}
            className={
              animate ? 'animate-in fade-in-0 duration-300' : undefined
            }
          >
            {cardContent}
          </div>
        );
      })}
    </div>
  );
}

// Preset configurations for common use cases
export const CardCollectionPresets = {
  /** Mobile-first responsive grid */
  responsive: {
    default: 1,
    sm: 2,
    md: 3,
    lg: 4,
    xl: 5,
    '2xl': 6,
  },
  /** Single column layout */
  single: {
    default: 1,
  },
  /** Two column layout */
  double: {
    default: 2,
  },
  /** Three column layout */
  triple: {
    default: 3,
  },
  /** Four column layout */
  quad: {
    default: 4,
  },
} as const;

export default CardCollection;
