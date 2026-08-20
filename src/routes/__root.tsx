import { useEffect } from "react";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { useAppStore } from "@/lib/store";
import appCss from "../styles.css?url";

const APP_NAME = "Repository, Rekonstruktion, Run";

const PREFS_BOOTSTRAP = `try{var p=JSON.parse(localStorage.getItem("rrr-prefs")||"{}");var r=document.documentElement;var t=p.theme||"auto";r.dataset.theme=t==="auto"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;if(p.lang)r.lang=p.lang;if(p.layout)r.dataset.layout=p.layout;}catch(e){}`;

function DocumentSync() {
  const hydrate = useAppStore((s) => s.hydrate);
  const theme = useAppStore((s) => s.theme);
  const lang = useAppStore((s) => s.lang);
  const layout = useAppStore((s) => s.layout);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const resolved =
        theme === "auto"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : theme;
      root.dataset.theme = resolved;
      root.lang = lang;
      root.dataset.layout = layout;
    };
    apply();
    if (theme !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme, lang, layout]);

  return null;
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "theme-color", content: "#17202a" },
      {
        name: "description",
        content:
          "Client-side repository workbench: import GitHub or a local folder, export HTML, JSON, Python and model-tuned AI prompts.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;500;600;700;800&family=Noto+Sans+JP:wght@400;700&family=Noto+Sans+SC:wght@400;700&family=Space+Mono:wght@400;700&display=swap",
      },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="de" data-theme="light" data-layout="auto" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOTSTRAP }} />
        <HeadContent />
      </head>
      <body className="antialiased bg-paper text-ink">
        <PreviewHostBridge />
        <AuthProvider>
          <DocumentSync />
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
