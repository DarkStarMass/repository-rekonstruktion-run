"use client";

import { LOCALES, LOCALE_LABELS, t, type Locale } from "@/lib/i18n";
import {
  useAppStore,
  type LayoutMode,
  type ThemeMode,
} from "@/lib/store";

const THEMES: ThemeMode[] = ["auto", "light", "dark", "contrast"];
const LAYOUTS: LayoutMode[] = ["auto", "desktop", "android"];

export function SettingsControls({
  variant,
  onLayoutChange,
}: {
  variant: "sidebar" | "sheet";
  onLayoutChange?: () => void;
}) {
  const lang = useAppStore((s) => s.lang);
  const theme = useAppStore((s) => s.theme);
  const layout = useAppStore((s) => s.layout);
  const setLang = useAppStore((s) => s.setLang);
  const setTheme = useAppStore((s) => s.setTheme);
  const setLayout = useAppStore((s) => s.setLayout);
  const prefix = variant === "sheet" ? "sheet-" : "";
  const fieldClass =
    variant === "sheet"
      ? "w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-signal"
      : "w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-signal";
  const labelClass =
    variant === "sheet"
      ? "mb-2 block text-xs font-semibold uppercase tracking-wider text-muted"
      : "mb-2 block text-xs font-semibold uppercase tracking-wider text-sidebar-fg/70";
  const optionClass = variant === "sheet" ? "text-ink" : "text-black";

  return (
    <div className="space-y-4">
      <label className="block">
        <span className={labelClass}>{t(lang, "theme.label")}</span>
        <select
          id={`${prefix}theme-select`}
          data-rrr-field="theme"
          className={fieldClass}
          value={theme}
          onChange={(event) => setTheme(event.target.value as ThemeMode)}
        >
          {THEMES.map((value) => (
            <option key={value} value={value} className={optionClass}>
              {t(lang, `theme.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>{t(lang, "lang.label")}</span>
        <select
          id={`${prefix}lang-select`}
          data-rrr-field="lang"
          className={fieldClass}
          value={lang}
          onChange={(event) => setLang(event.target.value as Locale)}
        >
          {LOCALES.map((value) => (
            <option key={value} value={value} className={optionClass}>
              {LOCALE_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>{t(lang, "layout.label")}</span>
        <select
          id={`${prefix}layout-select`}
          data-rrr-field="layout"
          className={fieldClass}
          value={layout}
          onChange={(event) => {
            setLayout(event.target.value as LayoutMode);
            onLayoutChange?.();
          }}
        >
          {LAYOUTS.map((value) => (
            <option key={value} value={value} className={optionClass}>
              {t(lang, `layout.${value}`)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
