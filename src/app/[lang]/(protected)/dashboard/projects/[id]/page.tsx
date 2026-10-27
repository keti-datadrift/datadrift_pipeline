'use client';

import { use } from 'react';

import { useSidebarControl } from '@/hooks/use-sidebar-control';

export default function ProjectPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { id } = use(params);
  useSidebarControl({
    autoHide: true,
  });

  const iframeSrc = `${process.env.NEXT_PUBLIC_HOST}labelstudio/projects/${id}`;

  return (
    <div className="w-full h-screen">
      <iframe src={iframeSrc} className="w-full h-screen" />
    </div>
  );
}
