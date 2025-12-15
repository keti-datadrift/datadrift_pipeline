'use client';

import { NavMain } from '@/components/app-sidebar/nav-main';
import { NavSecondary } from '@/components/app-sidebar/nav-secondary';
import { NavUser } from '@/components/app-sidebar/nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { logout } from '@/lib/api/endpoints';
import { Command } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { getSidebarData } from './data';
import { useI18n } from '@/contexts/I18nContext';

export function AppSidebar({
  onLogOut,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  onLogOut: () => Promise<void>;
}) {
  const { t } = useI18n();
  const data = React.useMemo(() => getSidebarData(t), [t]);

  return (
    <Sidebar
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]!"
      {...props}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Command className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{t('app.name')}</span>
                  <span className="truncate text-xs">v0.0.1 🌈</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} logout={logout} />
      </SidebarFooter>
    </Sidebar>
  );
}
