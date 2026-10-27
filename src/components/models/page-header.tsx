'use client';

import { Activity as DefaultIcon } from 'lucide-react';
import React from 'react';

type IconType = React.ComponentType<{ className?: string }>;

export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  icon?: IconType;
};

export function PageHeader({
  title,
  subtitle,
  icon: Icon = DefaultIcon,
}: PageHeaderProps) {
  return (
    <header className="border-b">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="size-10 bg-primary rounded-lg flex items-center justify-center">
              <Icon className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">{title}</h1>
              {subtitle ? (
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default PageHeader;
