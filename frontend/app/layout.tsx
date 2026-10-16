import '../styles/globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter, Fraunces, JetBrains_Mono } from 'next/font/google';
import { AuthProvider } from '../lib/auth';
import { NotificationsRuntime } from '../components/NotificationsRuntime';
import { ServiceWorkerBoot } from '../components/ServiceWorkerBoot';
import { PingAlert } from '../components/PingAlert';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  axes: ['opsz'],
  display: 'swap',
});
const mono = JetBrains_Mono({
  subsets: ['latin'], variable: '--font-mono', display: 'swap', weight: ['400', '500'],
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

export const viewport: Viewport = { themeColor: '#0F1322' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${mono.variable}`}>
      <body className="font-sans">
        <ServiceWorkerBoot />
        <AuthProvider>
          <NotificationsRuntime />
          <PingAlert />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
