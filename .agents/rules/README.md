# Rules

Coding rules for this repo, taken from [affaan-m/ecc](https://github.com/affaan-m/ecc) `rules/` (commit `b92f181`, MIT — see [LICENSE-ecc](LICENSE-ecc)) and filtered to the stack in [docs/DESIGN.md](../../docs/DESIGN.md): TypeScript everywhere, Vite + React SPA + HeroUI, Node worker, Supabase Edge Functions.

| Folder | Applies to | Files |
|---|---|---|
| `common/` | everything | coding-style, security, testing, git-workflow, code-review |
| `typescript/` | `*.ts`, `*.tsx` (web, worker, Edge Functions) | coding-style, security, testing |
| `react/` | `apps/web` | coding-style, hooks, patterns, security, testing |
| `web/` | `apps/web` | coding-style, patterns, security, performance |

Project-specific rules (not from ecc):

| File | Purpose |
|---|---|
| `cost.md` | **Hard rule** — zero cost, no paid services without user approval |
| `content-integrity.md` | **Hard rule** — summaries and translations faithful to the source, never invented |
| `PRONOUNS.md` | How to address the user in Vietnamese |

## Not taken

- Other languages/frameworks (Python, Go, Angular, Vue, Nuxt, React Native…).
- Claude/ECC tooling rules: `common/agents.md`, `common/hooks.md`, `common/performance.md` (model selection), `*/hooks.md` (editor hooks), `common/development-workflow.md` (depends on ECC agents/Exa/Context7).
- `common/patterns.md`, `typescript/patterns.md`: API envelope + repository pattern — the web talks to Supabase directly through RLS, no custom API layer.
- `web/design-quality.md` (anti-template visual policy) — the UI uses HeroUI as the design system.
- `web/testing.md` (multi-browser visual regression) — too heavy for this project; React/TS testing rules still apply.

## Edits from upstream

Removed only what does not apply here: references to ECC agents/skills, Next.js Server Components / Server Actions / SSR sections, and links to files not taken. No rule was rewritten.

## Project overrides

Where a rule conflicts with the agreed design, this section wins:

1. **Session storage** (`react/security.md` → "Never store sessions in localStorage"): supabase-js in a static SPA keeps the session in `localStorage`; there is no server to set httpOnly cookies. Mitigations instead: strict CSP, no `dangerouslySetInnerHTML` on fetched content, the only session is the admin's, and every write is enforced in Postgres by RLS + `is_admin()` (15-day limit).
2. **CSP nonces** (`web/security.md`, `react/security.md`): Netlify serves static files, so no per-request nonce. Use a static CSP in `apps/web/public/_headers` with `script-src 'self'` (no inline scripts) and `connect-src` limited to the Supabase project URL.
3. **CSRF** (`common/security.md`): auth uses a bearer token in the `Authorization` header, not cookies, so CSRF tokens are not needed. Rate limiting still applies (`request-otp`, `more-news`, `trigger-refresh`).
4. **Database rules** (SQL, migrations, RLS) are not covered by ecc rules; follow [docs/DESIGN.md §9, §10, §13.3](../../docs/DESIGN.md).
5. **Commits/PRs**: every change goes through a PR into `main` (DESIGN.md §13.6); commit format from `common/git-workflow.md`.
