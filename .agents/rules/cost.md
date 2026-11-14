# Cost Rules (HARD — always apply)

This project must run at **zero cost**. These rules are non-negotiable and override convenience, performance, or any other rule file. When in doubt, **stop and ask the user** — never assume something is free.

## 1. Forbidden without explicit user approval

- Introducing any **paid** service, plan, add-on, or API — including "pay-as-you-go", "usage-based", trials that convert to paid, and "free credits" that expire.
- Upgrading any existing service beyond its free tier (Supabase Pro, Netlify paid plan, GitHub paid features, paid AI tiers, Resend paid plan…).
- Enabling billing, adding a payment method, or using an API key from an account/project that has billing enabled.
- Choosing a model, endpoint, or feature that is billed (e.g. a paid model ID instead of a free one, an add-on like Supabase compute upgrade or PITR).
- Adding **any new external service, even a free one**, without first asking — every new service is a new quota that can break the system.

## 2. Approved services (free tier only)

| Service | Use | Watch out for |
|---|---|---|
| Supabase Free | DB, Auth, Edge Functions, pg_cron, Realtime | Keep **Spend Cap ON**; 500 MB DB; pauses after 7 days idle |
| Netlify Free | static web hosting | Credits per production deploy and bandwidth; no SSR/functions for app logic |
| GitHub (public repo) | code, Actions, Secrets | Actions are free only while the repo is **public** — making it private changes the cost model |
| Groq, Gemini, Cerebras, Cloudflare Workers AI (free tiers) | AI scoring / summary / translation | Gemini free tier only applies to keys from a project **without billing**; respect daily/RPM limits |
| Resend Free | OTP email | 100 emails/day, 3,000/month. Uses the default sender `onboarding@resend.dev` (no domain): it can only send to the Resend account's own email, so `ADMIN_EMAIL` must be that address |
| Jina Reader (`r.jina.ai`, no key) | fallback reader when a page cannot be fetched directly | ~20 requests/minute; the worker spaces calls ≥ 3.1 s apart; may block a domain for anonymous users for hours. Approved by the user on 2026-10-15. Do **not** use a Jina API key: its free tokens are one-time |
| DuckDuckGo HTML results (`html.duckduckgo.com`, no key) | free fallback web search of the job board | Unofficial page; blocks after ~3 queries in a row, so the worker sends at most 3 per run, 8 s apart. Approved by the user on 2026-11-15 |
| Job sites: ITviec (via Jina), VietnamWorks, LinkedIn guest search, CareerViet | job board listings | Public pages only; a blocked site is skipped, never worked around. Approved by the user on 2026-11-14 |
| FRED, EIA, SEC EDGAR, Treasury FiscalData, Google News RSS, GDELT, public RSS | data sources | Respect rate limits and required headers (SEC `User-Agent`) |

Anything not in this table needs user approval before use (rule 1).

## 2a. The one approved paid service

The user approved **one** exception on 2026-11-14: Gemini API "Grounding with Google Search" for the job board, on a separate prepaid Google project (`GEMINI_SEARCH_API_KEY`), capped at **1 USD per month**.

- Prepaid credit only, auto-reload **off**: an empty balance stops the service, it never bills the card.
- The worker enforces the cap itself (`apps/worker/src/jobs/search/budget.ts`, settings in `app_settings.job_search_budget`): it stops at 0.80 USD or 4,000 searches a month and spreads what is left over the remaining days. Never raise these limits, add another paid model, or use this key for anything else without asking.
- The digest's `GEMINI_API_KEY` stays on a project **without** billing.
- Details: `docs/JOBS_PLAN.md` §4.

## 3. Required when adding or changing anything that consumes quota

1. Document the free-tier limit and expected usage in `docs/DESIGN.md`.
2. Stay under **80%** of every limit; add a guard (counter, cap, fallback) instead of relying on luck.
3. On limit reached, **degrade gracefully** (pause, defer to next run, fall back to another free provider) — never fall through to a paid path.
4. Prefer deterministic code over AI calls; batch AI requests; never send full articles when a title or snippet is enough.

## 4. Red flags — stop and ask

- A setup step asks for a credit card or billing account.
- Docs mention "billed per…", "overage", "usage-based pricing", or a free tier that is "limited time".
- A library or SDK silently calls a hosted service (telemetry, cloud sync, hosted API) that is not in the approved table.
- A change would increase scheduled runs, AI calls, deploys, or stored data significantly.
