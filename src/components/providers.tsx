"use client";

import { ThemeProvider } from "next-themes";
import { createContext, useContext, useMemo } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  DEFAULT_FORMAT,
  formatCalendarDate,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRelative,
  type FormatConfig,
} from "@/lib/format";
import { I18nProvider } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n";

const FormatContext = createContext<FormatConfig>(DEFAULT_FORMAT);

export function useFormat() {
  const cfg = useContext(FormatContext);
  return useMemo(
    () => ({
      config: cfg,
      money: (v: Parameters<typeof formatMoney>[0], opts: Parameters<typeof formatMoney>[1] = {}) => formatMoney(v, { ...cfg, ...opts }),
      compact: (v: Parameters<typeof formatMoney>[0]) => formatMoney(v, { ...cfg, compact: true }),
      number: formatNumber,
      percent: formatPercent,
      date: (v: Parameters<typeof formatDate>[0]) => formatDate(v, cfg),
      calendarDate: (v: Parameters<typeof formatDate>[0]) => formatCalendarDate(v, cfg),
      dateTime: (v: Parameters<typeof formatDateTime>[0]) => formatDateTime(v, cfg),
      relative: (v: Date | string) => formatRelative(v, cfg.locale),
    }),
    [cfg],
  );
}

export function Providers({ locale, format, children }: { locale: Locale; format: FormatConfig; children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <I18nProvider locale={locale}>
        <FormatContext.Provider value={format}>
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster richColors closeButton position="top-right" />
          </TooltipProvider>
        </FormatContext.Provider>
      </I18nProvider>
    </ThemeProvider>
  );
}
