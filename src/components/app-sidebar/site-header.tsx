'use client';

import { SidebarIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import React from 'react';

import { BackgroundTaskIndicator } from '@/components/background-tasks/background-task-indicator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import { SidebarIcon } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

export function SiteHeader() {
  const { toggleSidebar } = useSidebar();
  const { t } = useI18n();
  const pathname = usePathname();

  const pathSegments = React.useMemo(() => {
    // Remove language prefix and split path
    const segments = pathname.replace(/^\/[a-z]{2}\//, '/').split('/').filter(Boolean);

    return segments.map((segment, index) => {
      const href = '/' + segments.slice(0, index + 1).join('/');
      const label = segment
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      return { href, label };
    });
  }, [pathname]);

  return (
    <header className="bg-background sticky top-0 z-50 flex w-full items-center border-b border-sidebar-border">
      <div className="flex h-[var(--header-height)] w-full items-center gap-2 px-4 justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            className="h-8 w-8"
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
          >
            <SidebarIcon />
          </Button>
          <Breadcrumb className="hidden sm:block">
            <BreadcrumbList>
              {pathSegments.length === 0 ? (
                <BreadcrumbItem>
                  <BreadcrumbPage>{t('sidebar.dashboard')}</BreadcrumbPage>
                </BreadcrumbItem>
              ) : (
                pathSegments.map((segment, index) => (
                  <React.Fragment key={segment.href}>
                    <BreadcrumbItem>
                      {index === pathSegments.length - 1 ? (
                        <BreadcrumbPage>{segment.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink href={segment.href}>
                          {segment.label}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {index < pathSegments.length - 1 && <BreadcrumbSeparator />}
                  </React.Fragment>
                ))
              )}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <BackgroundTaskIndicator />
        </div>
      </div>
    </header>
  );
}
