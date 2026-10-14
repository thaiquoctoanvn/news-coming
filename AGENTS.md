# AGENTS.md — news-coming

> Entry point for AI coding agents (Antigravity, Claude Code, Cursor, etc.).
> Detailed rules live in separate files under `.agents/rules/` and are
> referenced below using `@filename` so agents can pull them into context
> only when relevant.

---

## How to use this file

1. Read this file first in every session.
2. Treat anything under **Hard Rules** as non-negotiable, regardless of
   which topic file is loaded.
3. Before starting a task, check the **Rule File Index** below and load the
   file(s) whose trigger matches the task. Load more than one file if the
   task spans categories.
4. If a rule conflicts with a user instruction, follow the rule and explain
   why — unless the rule itself says to stop and ask first.

---

## Project Goals

- Run entirely on free tiers (Supabase, Netlify, GitHub Actions, free AI APIs) — zero cost is a hard constraint, not a preference.
- Minimize AI token use: deterministic code for fetching, dedup and filtering; AI only for scoring, summarizing and translating the few items that are actually shown.
- Never stop on quota: every pipeline step is idempotent and resumable; running out of quota delays work, it does not break the system.
- Deliver a short, prioritized Vietnamese digest (10–12 items) per topic, with configuration fully driven from the database and toggleable at every level.
- Keep the public site safe: public read only for enabled topics; all writes and quota-consuming actions are admin-only and enforced in Postgres (RLS).

---

## Project Snapshot

- **Status:** Phase 1 — schema/RLS/seed migrations, source verification script and CI/deploy workflows exist; no worker pipeline or web yet. The source of truth is `@docs/DESIGN.md`.
- **Stack (planned):** TypeScript everywhere; pnpm monorepo; web = Vite + React SPA + HeroUI v3 + Tailwind v4 + TanStack Query + react-hook-form + zod; worker = Node 24 running `.ts` directly (type stripping, `erasableSyntaxOnly`) on GitHub Actions; Supabase (Postgres, RLS, Auth email OTP via Resend, Edge Functions on Deno, pg_cron, Realtime); Netlify static hosting.
- **Architecture:** topic is the top-level unit (categories, entities, sources, slots, editions, data modules all belong to a topic). Layout: `apps/web`, `apps/worker`, `supabase/{migrations,seed,functions}`, shared core in `supabase/functions/_shared/` (fetch-only TS used by both worker and Edge Functions).
- **Data layer:** web talks to Supabase directly with the anon key + RLS (no custom API layer); worker uses the service_role key; AI providers (Groq for scoring/summary, Gemini for translation, with fallbacks) are configured in DB tables.
- **Delivery:** every change goes through a PR; merging to `main` auto-deploys DB migrations → Edge Functions → web → `prod` tag for the worker (`@docs/DESIGN.md` §13).

---

## Hard Rules (always apply)

- When replying to the user in Vietnamese, refer to yourself as **"em"** and address the user as **"đại ca"**. (`@.agents/rules/PRONOUNS.md`)
- **Zero cost:** never use, enable, or upgrade to any paid service, plan, model, or add-on, and never add billing or a payment method. Adding any new external service — even a free one — requires asking the user first. When unsure whether something costs money, stop and ask. (`@.agents/rules/cost.md`)
- Never commit secrets; the repo is public. Secrets live only in GitHub Secrets/Environments and Supabase Secrets/Vault.
- All changes go through a PR into `main`; never push directly to `main`.
- Migrations are forward-only; never edit a merged migration. Seed config uses `on conflict do nothing`.
- Where an ecc rule conflicts with the design, the **Project overrides** in `@.agents/rules/README.md` win.

---

## Rule File Index

| File | Load when... |
|---|---|
| `@.agents/rules/README.md` | Unsure which rules apply; a rule seems to conflict with the design (session storage, CSP, CSRF, DB rules); adding or removing rule files |
| `@.agents/rules/PRONOUNS.md` | Writing any chat reply in Vietnamese |
| `@.agents/rules/cost.md` | Adding a dependency, external service, API, AI model or provider; changing schedules, AI call volume, deploy frequency or storage; any setup step mentioning billing, credit card or pricing |
| `@.agents/rules/common/coding-style.md` | Writing or refactoring any code: immutability, KISS/DRY/YAGNI, file size limits, error handling, input validation, naming |
| `@.agents/rules/common/security.md` | Touching auth, OTP, RLS, secrets/env vars, user input, rate limiting, error messages; before any commit |
| `@.agents/rules/common/testing.md` | Adding features or fixing bugs (TDD flow), writing unit/integration/E2E tests, checking 80% coverage |
| `@.agents/rules/common/git-workflow.md` | Writing commit messages, creating branches or pull requests |
| `@.agents/rules/common/code-review.md` | Reviewing a diff or PR, deciding severity (CRITICAL/HIGH/MEDIUM/LOW), approve/block decisions |
| `@.agents/rules/typescript/coding-style.md` | Any `.ts`/`.tsx` (web, worker, Edge Functions): types vs interfaces, avoiding `any`, zod validation, async error handling, no `console.log` |
| `@.agents/rules/typescript/security.md` | Reading API keys/env vars in TS code, validating required secrets at startup |
| `@.agents/rules/typescript/testing.md` | Setting up or writing Playwright E2E tests |
| `@.agents/rules/react/coding-style.md` | Writing React components in `apps/web`: file naming, props shape, JSX conventions, imports, local state |
| `@.agents/rules/react/hooks.md` | Using or writing React hooks: `useEffect` misuse, dependency arrays, cleanup, memoization, custom hooks |
| `@.agents/rules/react/patterns.md` | Structuring pages/components: container vs presentational, where state lives, Suspense/Error Boundaries, forms, TanStack Query data fetching, list keys |
| `@.agents/rules/react/security.md` | Rendering fetched/AI-generated text or external links (article URLs), `dangerouslySetInnerHTML`, `VITE_*` env vars, auth gating in the UI |
| `@.agents/rules/react/testing.md` | Writing component or hook tests: Vitest + React Testing Library, query priority, `userEvent`, MSW mocks, a11y assertions, coverage targets |
| `@.agents/rules/web/coding-style.md` | Organizing `apps/web` folders, CSS tokens/Tailwind, animation properties, semantic HTML |
| `@.agents/rules/web/patterns.md` | Choosing state tooling (server/client/URL/form state), URL-as-state for filters (topic, date, edition), optimistic updates, parallel loading |
| `@.agents/rules/web/security.md` | Configuring Netlify `_headers` (CSP, HSTS, etc.), XSS prevention, third-party scripts, form abuse protection |
| `@.agents/rules/web/performance.md` | Bundle size budgets, lazy-loading heavy libraries (charts), images, fonts, Core Web Vitals |
| `@docs/DESIGN.md` | Any work on schema/RLS/migrations, worker pipeline, AI providers and quotas, scoring/slot selection, scheduling, Edge Functions, CI/CD |
