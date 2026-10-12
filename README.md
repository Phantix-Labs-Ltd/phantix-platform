# Phantix Platform

Where an organization is created and administered. Admins register here, go
through first-run setup (approvals, service key, security database, domain,
plan, applications), and then manage users, connections, billing and
integrations. Operators do their security work in the SecureGraph apps.

| | |
| --- | --- |
| **Live** | https://platform.phantixlabs.com |
| **Users** | Organization admins |
| **Part of** | `Phantix-Labs-Ltd/phantix-platform` (its own repository) |
| **Stack** | React 18, TypeScript, Vite 5, Tailwind CSS, React Router 6 |
| **Local** | http://localhost:5174 |
| **Deploys to** | Vercel, on push to `main` |

## What it does

| Area | Routes |
| --- | --- |
| Sign-up and sign-in | `/register` (beta opt-in while the beta runs), `/waitlist` (when registration is closed), `/login`, `/auth/github/callback`, `/change-password`, `/device-confirm`, `/password-reset`, `/reset-password` |
| First-run setup | `/get-started` (Quick Scan), `/get-started/approvals` (solo mode or dual control), `/get-started/service-key`, `/connections/new` (security database), `/get-started/verify-domain`, `/get-started/plan`, `/get-started/applications`, `/get-started/app-access` |
| Organization | `/dashboard`, `/identity` (verified domains), `/companies`, `/users`, `/settings` |
| Security database | `/connections`, `/connections/new/*`: publicly hosted (with the egress IP allowlist) or private network (through the connector) |
| Applications and tools | `/applications`, `/tools`, `/github`, `/integrations` |
| AI | `/ai`, `/agi` (pentest agent settings) |
| Billing | `/billing` |
| Governance | `/audit`, `/agent-activity`, `/alerts`, `/danger-zone` |
| Help | `/docs`, `/support`, `/sandbox` |
| Legal | `/privacy`, `/terms`, `/aup`, `/cookies` |

The order of the first-run steps lives in `src/lib/firstRun.ts`. With dual
control on, the approvals step routes through `/users` to assign the initiator
and authorizer before the service key.

## How it fits

- **Its own sign-in.** The Platform uses the organization realm (company account
  and org-user JWTs), not the app session the operator apps share.
- **Hands operators to Core.** Once setup is done, operators work in Core,
  Attack, Defend and Code; `src/lib/links.ts` builds those links.
- **API.** Calls `/api/v1` on its own origin; Vercel rewrites `/api/*` to the
  backend.
- **Security database.** Customer findings live in the organization's own
  database, connected here. A public host must allowlist SecureGraph's egress
  IPs; a private one goes through `sg-connector` (backend repo, `connector/`).

## Run it locally

Prerequisites: Node 20 and npm.

```bash
npm install
npm run dev               # http://localhost:5174
```

The dev server proxies `/api` to `https://staging.phantix.site`. For a local
backend: `API_PROXY_TARGET=http://localhost:8000 npm run dev`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_PROXY_TARGET` | `https://staging.phantix.site` | Dev proxy target for `/api`. Server-side only. |
| `DEV_PORT` | `5174` | Port when `vite` runs without the npm script. |
| `VITE_PLATFORM_URL`, `VITE_CORE_URL`, `VITE_ATTACK_URL`, `VITE_DEFEND_URL`, `VITE_CODE_URL` | local ports in dev, production hosts in a build | Links to the apps; set them to point a local Platform at deployed apps. |

## Project layout

```
src/
  App.tsx           Routes: public and auth pages, setup, then the layout
  pages/            Admin pages; auth/ (register, waitlist, legal); setup/ (first-run steps)
  components/       Layout, connection and allowlist forms, banners, overlays, tour
  lib/              API client, store, firstRun order, links, config, beta and waitlist
docs/how-to/        Synced copy of the Platform how-tos (canonical copy is in Phantix-Frontend)
scripts/            check-event-after-await.mjs
vite/siteFiles.ts   Sitemap and robots.txt
public/             Brand assets; falls back to the monorepo's public/ when absent
vercel.json         /api rewrite, SPA fallback, headers
```

## Checks

CI (`.github/workflows/ci.yml`) runs, in order:

```bash
npm install
npm run lint:events       # no React event use after an await in a handler
npm run typecheck
npm run build
```

`npm run verify` runs the first two checks. There is no unit test suite.

## Deploy

Vercel builds the repository with `npm run build` into `dist` and deploys
production on push to `main`; other branches get previews. `vercel.json` rewrites
`/api/*` to the backend and every other path to `index.html`.

## Related

- Phantix-Frontend: the operator apps, `docs/README-STANDARD.md`, and the canonical Platform how-tos
- Phantix_Backend: `connector/` (private-network databases), `docs/05-platform/`
