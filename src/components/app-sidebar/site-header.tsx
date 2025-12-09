'use client';

import { BackgroundTaskIndicator } from '@/components/background-tasks/BackgroundTaskIndicator';
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
              <BreadcrumbItem>
                <BreadcrumbLink href="#">#</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{t('sidebar.dashboard')}</BreadcrumbPage>
              </BreadcrumbItem>
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
