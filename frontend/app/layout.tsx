import '../styles/globals.css';
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { AuthProvider } from '../lib/auth';
import { NotificationsRuntime } from '../components/NotificationsRuntime';
import { ServiceWorkerBoot } from '../components/ServiceWorkerBoot';
import { PingAlert } from '../components/PingAlert';
import { SenderToasts } from '../components/SenderToasts';

// Sunbeam §3.1 — Noto Sans, self-hosted (no third-party font CDN), one
// variable Latin file covering every weight. Non-Latin scripts fall back to
// the OS font on purpose.
const noto = localFont({
  src: './fonts/noto-sans-latin.woff2',
  variable: '--font-noto',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Office Ping',
  description: 'A digital tap on the shoulder — for the office network.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/icons/icon-180-apple.png',
  },
};

// resizes-content: on Android the page shrinks above the keyboard, so the
// phone composer's Send bar stays visible while typing.
export const viewport: Viewport = { themeColor: '#FFFBEA', viewportFit: 'cover', interactiveWidget: 'resizes-content' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={noto.variable}>
      <body className="font-sans">
        <ServiceWorkerBoot />
        <AuthProvider>
          <NotificationsRuntime />
          <PingAlert />
          <SenderToasts />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
