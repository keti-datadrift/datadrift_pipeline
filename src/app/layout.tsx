import { AuthProvider } from '@/contexts/AuthContext';
import type { Metadata } from 'next';
import './globals.css';
import { JetBrains_Mono } from 'next/font/google';
import React from 'react';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'Q-OCR Dashboard',
  description:
    'The Q-OCR Dashboard is a powerful tool for converting images to text.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable}`}>
      <body className={'antialiased bg-sidebar-background'}>
        <AuthProvider>
          <main className="flex-1">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
