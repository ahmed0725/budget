"use client";

import { createContext, useContext, useMemo } from "react";
import { createT, type Locale, type TFunction } from "./index";

const I18nContext = createContext<{ locale: Locale; t: TFunction }>({ locale: "en", t: createT("en") });

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: createT(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  return useContext(I18nContext);
}
