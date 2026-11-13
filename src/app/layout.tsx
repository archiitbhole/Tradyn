import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { Providers } from "@/components/layout/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Tradyn — Indian stock market dashboard", template: "%s · Tradyn" },
  description: "NSE and BSE indices, shares, charts, watchlists and market insights, with a separate rule-based market simulator.",
  applicationName: "Tradyn",
  appleWebApp: { capable: true, title: "Tradyn", statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070c18" },
    { media: "(prefers-color-scheme: light)", color: "#f3f6fb" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
