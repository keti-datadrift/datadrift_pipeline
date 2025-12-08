import { BookOpen, BrainCircuit, Database, SquareTerminal } from 'lucide-react';

export const data = {
  user: {
    name: 'admin',
    email: 'qocr@admin.com',
    avatar: '/next.svg',
  },
  navMain: [
    {
      title: 'Data',
      url: '/dashboard/projects',
      icon: Database,
      isActive: true,
      items: [],
    },
    {
      title: 'Models',
      url: '/dashboard/models',
      icon: BrainCircuit,
      items: [
        {
          title: 'Training',
          url: '/dashboard/models/train',
        },
      ],
    },
    {
      title: 'Monitoring',
      url: '/dashboard/monitoring',
      icon: BookOpen,
      items: [
        {
          title: 'Default Models',
          url: '/dashboard/monitoring/default',
        },
        {
          title: 'Training Status',
          url: '/dashboard/monitoring/status',
        },
        {
          title: 'Logs',
          url: '/dashboard/monitoring/logs',
        },
      ],
    },
    {
      title: 'Playground',
      url: '/services/gradio',
      icon: SquareTerminal,
      items: [],
    },
  ],
  navSecondary: [],
};
