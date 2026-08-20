"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { GitFork } from "lucide-react";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { t } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const lang = useAppStore((s) => s.lang);
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 py-10 text-ink">
      <div className="panel w-full max-w-md rounded-lg p-7">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-sm bg-signal text-signal-fg">
            <GitFork size={20} />
          </div>
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] text-muted">
              {t(lang, "brand.toolkit")}
            </p>
            <h1 className="text-xl font-bold leading-tight">{t(lang, "login.title")}</h1>
          </div>
        </div>
        <p className="mb-6 text-sm leading-relaxed text-muted">{t(lang, "login.lead")}</p>
        {authEnabled ? (
          <div className="space-y-3">
            {GROK_PROVIDERS.map((provider) => (
              <button
                key={provider.providerId}
                type="button"
                className="action w-full rounded-md px-4 py-3 font-bold"
                onClick={() => void signIn(provider.providerId, { callbackURL: "/" })}
              >
                {provider.idp === "google" ? t(lang, "login.google") : t(lang, "login.x")}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">{t(lang, "login.disabled")}</p>
        )}
        <Link
          to="/"
          className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-signal"
        >
          {t(lang, "login.back")}
        </Link>
      </div>
    </main>
  );
}
