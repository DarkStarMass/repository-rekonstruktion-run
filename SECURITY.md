# Security Policy

## Supported versions

The `main` branch is the only supported line.

## What this app stores

- **In the browser only:** imported file contents (memory of the current tab).
- **localStorage:** language, theme, layout, last GitHub URL, last 10 history rows (time / action / model / status). No file bodies.
- **Optional sign-in:** Google / X via Better Auth. Not required to use the workbench.

There is no server-side store for repository contents.

## Reporting a vulnerability

Please **do not** open a public issue for security reports.

Use GitHub’s private advisory form:

https://github.com/DarkStarMass/repository-rekonstruktion-run/security/advisories/new

Include:

- a short description
- steps to reproduce
- impact (data leak, XSS, prototype pollution, dependency CVE, …)
- a suggested fix if you have one

We aim to acknowledge reports within 7 days.

## Out of scope

- GitHub API rate limits and private-repo 404s (expected)
- Browser clipboard permission denials
- Running the app against untrusted HTML exports you generated yourself
