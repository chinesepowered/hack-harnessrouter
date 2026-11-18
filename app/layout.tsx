import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sentinel | AI Security Analyst',
  description:
    'Paste code, drop files, or paste a GitHub repo. Sentinel’s agent reviews it in a sandbox and returns a severity-graded security report with exact fixes. Powered by HarnessRouter.',
};

export const viewport: Viewport = { themeColor: '#05070a', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
