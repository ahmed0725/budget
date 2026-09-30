import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { getLocale } from "@/lib/i18n/server";
import { getSettings } from "@/lib/services/settings";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return {
    title: { default: "Government Budget Management System", template: `%s · GBMS` },
    description: `${settings.organization.ministryNameEn} — budget preparation, approval, execution and reporting`,
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [locale, settings] = await Promise.all([getLocale(), getSettings()]);
  return (
    <html lang={locale} suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers
          locale={locale}
          format={{
            currencyCode: settings.currency.code,
            currencySymbol: settings.currency.symbol,
            decimals: settings.currency.decimals,
            timezone: settings.timezone,
            locale,
          }}
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
