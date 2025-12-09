"use client";

import { useI18n } from '@/contexts/I18nContext';

export default function ExportPage() {
  const { t } = useI18n();
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">{t('monitoring.default.title')}</h1>
        <p className="text-sm text-gray-600">{t('monitoring.default.description')}</p>
      </div>
    </div>
  );
}
