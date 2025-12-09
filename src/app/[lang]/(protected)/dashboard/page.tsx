import React from 'react';
import { redirect } from 'next/navigation';

export default function DashboardPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = React.use(params);
  return redirect(`/${lang}/dashboard/projects`);
}
