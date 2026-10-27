import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import React from 'react';

export default function RootPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = React.use(params);
  const cookieStore = React.use(cookies());

  // Consider authenticated when both LS tokens exist
  const isAuthed =
    cookieStore.has('ls_access_token') && cookieStore.has('ls_refresh_token');

  if (isAuthed) {
    redirect(`/${lang}/dashboard`);
  }
  redirect(`/${lang}/login`);
}
