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
| Resend Free | OTP email | 100 emails/day, 3,000/month |
| Jina Reader (`r.jina.ai`, no key) | reading article text for summaries | ~20 requests/minute; the worker spaces calls ≥ 3.1 s apart. Approved by the user on 2026-10-15 |
| FRED, EIA, SEC EDGAR, Treasury FiscalData, Google News RSS, GDELT, public RSS | data sources | Respect rate limits and required headers (SEC `User-Agent`) |

Anything not in this table needs user approval before use (rule 1).

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
