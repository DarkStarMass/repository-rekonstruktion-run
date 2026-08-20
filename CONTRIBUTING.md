# Contributing

Thanks for helping with **Repository, Rekonstruktion, Run**.
This project is public and open to patches, translations, and ideas.

Danke, dass du mitarbeiten willst. Issues und PRs gerne auf Deutsch oder Englisch.

## Ground rules

1. Read the [Code of Conduct](CODE_OF_CONDUCT.md).
2. Search existing [issues](https://github.com/DarkStarMass/repository-rekonstruktion-run/issues) before opening a new one.
3. Keep PRs focused. One concern per pull request.
4. Do not commit secrets, `.env` files, or personal repository contents.
5. UI copy belongs in `src/lib/i18n.ts` — add **all five** locales (`de`, `en`, `fr`, `zh`, `ja`) in the same PR.

## Local setup

```bash
git clone https://github.com/DarkStarMass/repository-rekonstruktion-run.git
cd repository-rekonstruktion-run
npm install
npm run dev
```

The app listens on `http://127.0.0.1:8080`.

## Checks before you push

```bash
npm run typecheck
npm run lint
npm run build
```

## What to work on

Good first contributions:

- Missing or awkward translations
- Accessibility (focus, contrast, labels)
- Import edge cases (odd GitHub URLs, huge trees, binary files)
- Export fidelity (HTML / JSON / Python / AI chunks)
- Tests around `src/lib/repo-engine.ts`

Larger work: open an issue first so we can align on the approach.

## Branch & commit style

- Branch from `main`: `feat/…`, `fix/…`, `docs/…`, `i18n/…`
- Commits in present tense: `Add Japanese dock labels`, `Fix Android overlay clipping`
- PRs need a short description of *why*, not only *what*

## Privacy

Local folder and ZIP contents must stay in the browser. Do not add a server upload
path for repository files. GitHub fetches already go from the visitor’s browser
to the public GitHub API.

## License

By contributing you agree that your work is released under the [MIT License](LICENSE).
