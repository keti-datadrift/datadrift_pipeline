'use client';

import { AppSidebar } from '@/components/app-sidebar/app-sidebar';
import { SiteHeader } from '@/components/app-sidebar/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useAuthContext } from '@/contexts/AuthContext';
import { BackgroundTaskProvider } from '@/contexts/BackgroundTaskContext';
import React from 'react';

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { logoutAction } = useAuthContext();

  return (
    <BackgroundTaskProvider>
      <div className="[--header-height:theme(spacing.14)]">
        <SidebarProvider className="flex flex-col">
          <SiteHeader />
          <div className="flex flex-1">
            <AppSidebar animateOnHover={false} onLogOut={logoutAction} />
            <SidebarInset>
              <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </div>
    </BackgroundTaskProvider>
  );
}
