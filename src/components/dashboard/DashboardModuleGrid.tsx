import type { ReactNode } from 'react';

export interface DashboardModuleGridProps {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  gap?: 'small' | 'medium' | 'large';
  className?: string;
}

const columnStyles: Record<2 | 3 | 4, string> = {
  2: 'grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-2 lg:grid-cols-2',
  3: 'grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3',
  4: 'grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
};

const gapStyles: Record<'small' | 'medium' | 'large', string> = {
  small: 'gap-2.5 sm:gap-3',
  medium: 'gap-3 sm:gap-3.5 lg:gap-4',
  large: 'gap-3.5 sm:gap-4 lg:gap-5',
};

export default function DashboardModuleGrid({
  children,
  columns = 3,
  gap = 'medium',
  className = '',
}: DashboardModuleGridProps) {
  return (
    <div
      className={[
        'grid w-full',
        columnStyles[columns],
        gapStyles[gap],
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}
