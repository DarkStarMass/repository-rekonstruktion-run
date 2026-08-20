"use client";

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BatteryFull,
  Bot,
  Braces,
  CircleHelp,
  FileCode2,
  GitFork,
  House,
  Settings2,
  SquareTerminal,
  Wifi,
  X,
} from "lucide-react";
import { Toaster } from "sonner";
import { authEnabled, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { t } from "@/lib/i18n";
import { useAppStore, type ViewId } from "@/lib/store";
import { SettingsControls } from "./settings";
import { ActiveView } from "./views";

const NAV: Array<{
  id: ViewId;
  key: string;
  shortKey: string;
  icon: typeof House;
}> = [
  { id: "home", key: "nav.home", shortKey: "nav.home", icon: House },
  { id: "html", key: "nav.html", shortKey: "nav.htmlShort", icon: FileCode2 },
  { id: "json", key: "nav.json", shortKey: "nav.jsonShort", icon: Braces },
  { id: "python", key: "nav.python", shortKey: "nav.pythonShort", icon: SquareTerminal },
  { id: "ai", key: "nav.ai", shortKey: "nav.aiShort", icon: Bot },
  { id: "info", key: "nav.info", shortKey: "nav.infoShort", icon: CircleHelp },
];

function Clock() {
  const [now, setNow] = useState("--:--");
  useEffect(() => {
    const tick = () =>
      setNow(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="font-mono text-[11px] font-bold tabular-nums">{now}</span>
  );
}

function AuthChip({ onInk = true }: { onInk?: boolean }) {
  const lang = useAppStore((s) => s.lang);
  const { user, isPending } = useCurrentUserState();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const muted = onInk ? "bg-white/15 text-sidebar-fg" : "bg-line text-ink";
  if (!mounted || isPending) {
    return <div className={`h-8 w-24 animate-pulse rounded ${muted}`} />;
  }
  if (!user) {
    return (
      <Link
        to="/login"
        className={`inline-flex min-h-10 items-center text-sm font-semibold underline-offset-4 hover:underline ${
          onInk ? "text-sidebar-fg" : "text-ink"
        }`}
      >
        {t(lang, "auth.signIn")}
      </Link>
    );
  }
  const label = user.displayName ?? user.primaryEmail ?? "Account";
  return (
    <div className={`flex items-center gap-2 ${onInk ? "text-sidebar-fg" : "text-ink"}`}>
      {user.profileImageUrl ? (
        <img src={user.profileImageUrl} alt="" className="size-8 rounded-full object-cover" />
      ) : (
        <span className={`grid size-8 place-items-center rounded-full text-sm font-medium ${muted}`}>
          {label.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="max-w-[9rem] truncate text-sm font-medium">{label}</span>
      {authEnabled ? (
        <button
          type="button"
          className="text-sm underline-offset-4 opacity-70 hover:underline"
          onClick={() => void signOut()}
        >
          {t(lang, "auth.signOut")}
        </button>
      ) : null}
    </div>
  );
}

function NavButtons({
  view,
  onSelect,
  variant,
}: {
  view: ViewId;
  onSelect: (id: ViewId) => void;
  variant: "side" | "bottom";
}) {
  const lang = useAppStore((s) => s.lang);
  return (
    <>
      {NAV.map((item) => {
        const Icon = item.icon;
        const active = view === item.id;
        if (variant === "bottom") {
          return (
            <button
              key={`b-${item.id}`}
              type="button"
              className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-semibold ${
                active ? "text-signal" : "text-sidebar-fg/80"
              }`}
              onClick={() => onSelect(item.id)}
            >
              <Icon size={18} />
              <span className="max-w-full truncate">{t(lang, item.shortKey)}</span>
            </button>
          );
        }
        return (
          <button
            key={`s-${item.id}`}
            type="button"
            className={`nav-item ${active ? "active" : ""}`}
            onClick={() => onSelect(item.id)}
          >
            <Icon size={17} />
            <span>{t(lang, item.key)}</span>
          </button>
        );
      })}
    </>
  );
}

export function RrrApp() {
  const lang = useAppStore((s) => s.lang);
  const view = useAppStore((s) => s.view);
  const layout = useAppStore((s) => s.layout);
  const setView = useAppStore((s) => s.setView);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <div className="layout-stage">
      <div id="rrr-shell" className={`app-shell ${layout}`}>
        <aside className="sidebar bg-sidebar px-5 py-6 text-sidebar-fg md:sticky md:top-0 md:h-dvh">
          <header className="border-b border-white/20 pb-5">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-sm bg-signal text-signal-fg">
                <GitFork size={22} />
              </div>
              <div>
                <p className="font-mono text-[10px] tracking-[0.2em] text-sidebar-fg/70">
                  {t(lang, "brand.toolkit")}
                </p>
                <h1 className="text-[17px] leading-tight font-bold text-sidebar-fg">
                  Repository, Rekonstruktion, Run
                </h1>
              </div>
            </div>
          </header>
          <nav aria-label="Main" className="mt-5 space-y-1">
            <NavButtons view={view} onSelect={setView} variant="side" />
          </nav>
          <div className="mt-6 border-t border-white/20 pt-5 md:mt-auto">
            <div className="mb-4">
              <AuthChip />
            </div>
            <SettingsControls variant="sidebar" />
          </div>
        </aside>

        <div className="android-status items-center justify-between bg-sidebar px-5 py-2 text-sidebar-fg">
          <Clock />
          <span className="font-mono text-[10px] tracking-[0.18em]">ANDROID</span>
          <span className="flex items-center gap-1.5 opacity-80" aria-hidden>
            <Wifi size={12} />
            <BatteryFull size={14} />
          </span>
        </div>
        <header className="android-bar items-center gap-3 bg-sidebar px-4 py-3 text-sidebar-fg">
          <div className="grid size-8 place-items-center rounded-sm bg-signal text-signal-fg">
            <GitFork size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[9px] tracking-[0.18em] text-sidebar-fg/70">
              {t(lang, "brand.toolkit")}
            </p>
            <h1 className="truncate text-sm font-bold text-sidebar-fg">
              Repository, Rekonstruktion, Run
            </h1>
          </div>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-md"
            onClick={() => setSettingsOpen(true)}
            aria-label={t(lang, "common.settings")}
            aria-expanded={settingsOpen}
          >
            <Settings2 size={18} />
          </button>
        </header>

        <main className="w-full px-4 py-6 sm:px-8 lg:px-12">
          <ActiveView view={view} />
        </main>

        <nav
          aria-label="Main"
          className="android-dock border-t border-line bg-sidebar pb-[env(safe-area-inset-bottom)]"
        >
          <NavButtons view={view} onSelect={setView} variant="bottom" />
        </nav>

        {settingsOpen ? (
          <div className="rrr-settings-overlay">
            <div className="panel max-h-[85dvh] w-full max-w-md overflow-auto rounded-t-lg p-6 sm:rounded-lg">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">{t(lang, "common.settings")}</h2>
                <button
                  type="button"
                  className="grid size-11 place-items-center"
                  onClick={() => setSettingsOpen(false)}
                  aria-label={t(lang, "common.close")}
                >
                  <X size={18} />
                </button>
              </div>
              <SettingsControls
                variant="sheet"
                onLayoutChange={() => setSettingsOpen(false)}
              />
              <div className="mt-5 border-t border-line pt-4">
                <AuthChip onInk={false} />
              </div>
            </div>
          </div>
        ) : null}
      </div>
      </div>
      <Toaster position="bottom-right" theme="dark" />
    </>
  );
}
