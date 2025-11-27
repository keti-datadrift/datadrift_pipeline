'use client';

import { AppSidebar } from '@/components/app-sidebar/app-sidebar';
import { SiteHeader } from '@/components/app-sidebar/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') return;

    const checkAuth = async () => {
      try {
        await getCurrentUser();
      } catch (error) {
        console.error(
          'Authentication check failed, redirecting to login:',
          error,
        );
        router.replace('/login');
      }
    };

    checkAuth();
  }, [router]);

  return (
    <div className="[--header-height:calc(--spacing(14))]">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar animateOnHover={false} />
          <SidebarInset>
            <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
