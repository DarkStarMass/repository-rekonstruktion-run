# Repository, Rekonstruktion, Run

Client-side workbench: take a **GitHub URL**, a **local folder** or a **ZIP**,
then reconstruct it as **HTML**, **JSON**, **Python** and a **model-tuned AI prompt**.

Public, MIT-licensed, open to pull requests.

[Report a bug](https://github.com/DarkStarMass/repository-rekonstruktion-run/issues/new?template=bug_report.yml)
·
[Request a feature](https://github.com/DarkStarMass/repository-rekonstruktion-run/issues/new?template=feature_request.yml)
·
[Contributing](CONTRIBUTING.md)

---

## Deutsch

**Repository, Rekonstruktion, Run** ist eine Browser-Werkbank. Dateien bleiben
im aktuellen Fenster. Es gibt keinen Upload auf einen App-Server. Aufrufe zu
öffentlichen GitHub-Repos gehen direkt vom Browser an die GitHub-API.

### Funktionen

| Bereich | Was passiert |
| --- | --- |
| Import | GitHub-URL, Ordner, ZIP oder Beispieldaten |
| HTML | Projektgerüst mit Dateibaum + ZIP |
| JSON | Maschinenlesbares Manifest + ZIP |
| Python | Startskript mit eingebettetem Manifest + ZIP |
| KI-Text | Prompt für Gemini, Claude, Grok oder TeraAI, automatisch gechunkt |
| Verlauf | Die letzten 10 Aktionen in `localStorage` |

### Sprachen

Deutsch · English · Français · 中文 · 日本語

Die **Oberfläche** folgt der gewählten Sprache. Die **KI-Prompts** bleiben
Englisch — das ist für die Modelle zuverlässiger.

### Darstellung

- **Hell** — warmes Papier `#f3f0e8`, Tinte `#17202a`, Rostorange `#e7542f`
- **Dunkel** — Tinte und Signal
- **Kontrast** — Schwarz, Weiß, Gelb, fette Schrift
- **Automatisch** — folgt dem System

### Ansicht

- **Automatisch** — Sidebar am Rechner, untere Leiste auf dem Handy
- **Desktop-PC** — immer Sidebar
- **Mobile Android** — Statusleiste, App-Leiste, Dock; auf großem Bildschirm ein Geräterahmen

Anmeldung (Google / X) ist **optional**. Die Werkbank läuft ohne Konto.

---

## English

Import a public GitHub repository or analyse files locally, then export a
structured reconstruction. Nothing is uploaded to an application server.

### Quick start

```bash
git clone https://github.com/DarkStarMass/repository-rekonstruktion-run.git
cd repository-rekonstruktion-run
npm install
npm run dev
```

Open `http://127.0.0.1:8080`.

```bash
npm run typecheck
npm run build
```

### Stack

React 19 · TypeScript · Vite 8 · TanStack Start · Tailwind v4 · Zustand · JSZip

### Privacy

| Stored | Where |
| --- | --- |
| File contents | Current browser tab only |
| Language, theme, layout, last URL, last 10 actions, export switches, model-limit overrides | `localStorage` |
| Optional GitHub token | Memory of the current tab only — never stored, never sent to an app server |
| Optional profile | Better Auth (Google / X) if you sign in |

Exports (prompt, JSON, ZIP) run a secret scan first. Filenames such as `.env` and typical token patterns are omitted until you turn on “Include anyway”.

`nitro` stays pinned at `3.0.260610-beta` because the deploy runtime expects that beta. Do not bump it in app pull requests.


### Project layout

```
src/components/rrr/   UI shell, views, settings
src/lib/repo-engine.ts  GitHub / folder / ZIP / exports / AI prompts
src/lib/i18n.ts       de · en · fr · zh · ja
src/lib/store.ts      zustand + localStorage
docs/                 original Canva prototype
```

### Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Translations must cover all five locales
in the same PR. Keep repository file bodies client-side.

### License

[MIT](LICENSE) © 2026 DarkStarMass
