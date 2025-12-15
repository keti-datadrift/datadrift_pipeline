'use client';

import { LoginForm } from '@/components/login-form';
import { useI18n } from '@/contexts/I18nContext';
import { GalleryVerticalEnd } from 'lucide-react';

export default function LoginPage() {
  const { t } = useI18n();

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <a href="#" className="flex items-center gap-2 font-medium">
            <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
              <GalleryVerticalEnd className="size-4" />
            </div>
            Acme Inc.
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm />
          </div>
          {t('app.name')}
        </a>
        <LoginForm />
      </div>
    </div>
  );
}
