import { BookOpen, BrainCircuit, Database } from 'lucide-react';

export function getSidebarData(t: (key: string) => string) {
  return {
    user: {
      name: 'admin',
      email: 'qocr@admin.com',
      avatar: '/next.svg',
    },
    navMain: [
      {
        title: t('nav.data'),
        url: '/dashboard/projects',
        icon: Database,
        isActive: true,
        items: [
          {
            title: t('nav.workspaces'),
            url: '/dashboard/projects',
            icon: Database,
            isActive: true,
            items: [],
          },
        ],
      },
      {
        title: t('nav.models'),
        url: '/dashboard/models',
        icon: BrainCircuit,
        isActive: true,
        items: [
          {
            title: t('nav.models'),
            url: '/dashboard/models',
          },
          {
            title: t('nav.training'),
            url: '/dashboard/models/train',
          },
          {
            title: t('nav.defaultModels'),
            url: '/dashboard/models/default',
          },
        ],
      },
      {
        title: t('nav.monitoring'),
        url: '/dashboard/monitoring/',
        icon: BookOpen,
        isActive: true,
        items: [
          {
            title: t('nav.playground'),
            url: '/services/gradio',
          },
          {
            title: t('nav.trainingStatus'),
            url: '/dashboard/monitoring/train',
          },
          {
            title: t('nav.logs'),
            url: '/dashboard/monitoring/logs',
          },
        ],
      },
    ],
    navSecondary: [],
  };
}
