import type { ReactNode } from 'react';

export interface DashboardModuleGridProps {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  gap?: 'small' | 'medium' | 'large';
  layout?: 'grid' | 'list';
  className?: string;
}

const columnStyles: Record<2 | 3 | 4, string> = {
  2: 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-2',
  3: 'grid-cols-3 sm:grid-cols-3 lg:grid-cols-3',
  4: 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-4',
};

const gapStyles: Record<'small' | 'medium' | 'large', string> = {
  small: 'gap-2',
  medium: 'gap-2 sm:gap-2.5',
  large: 'gap-2.5 sm:gap-3',
};

export default function DashboardModuleGrid({
  children,
  columns = 4,
  gap = 'medium',
  layout = 'grid',
  className = '',
}: DashboardModuleGridProps) {
  return (
    <div
      className={[
        'grid w-full',
        layout === 'list' ? 'grid-cols-1 gap-2' : `${columnStyles[columns]} ${gapStyles[gap]}`,
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}
