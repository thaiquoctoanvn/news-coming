# Content Integrity Rules (HARD — always apply)

Readers act on this digest's financial news. Every published summary and translation must be faithful to the original article. These rules are non-negotiable and override length, style or completeness goals.

## 1. Summaries are faithful to the source

- Use **only** facts stated in the article's own text: no outside knowledge, no assumptions, no speculation, no invented numbers, quotes, names, dates or causes.
- Market impact, outlook or "what to watch" may appear **only if the article itself says it**, attributed to its source ("analysts at X expect…").
- Numbers, percentages, prices, dates and quotes are copied exactly as in the source.
- If the text is short, the summary is short. Never pad.

## 2. Title and content come from the same article

- A summary is built only from the text of the article it is published under. Never combine one article's title with another article's text.
- When an article cannot be read, replace it **as a whole** (title, link, source, text) with another outlet's article about the same story, or drop it.

## 3. Translations add nothing

- The Vietnamese translation carries the same facts as the English summary — nothing added, nothing dropped, numbers unchanged.

## 4. Enforcement in code

- Prompts must state rules 1–3 explicitly (`supabase/functions/_shared/prompts.ts`).
- Automatic checks must stay in place (`supabase/functions/_shared/faithfulness.ts`): every number in a summary must appear in the source text, and every number in a translation must appear in the English summary.
- A failed check is retried once; if it still fails, the article is marked `failed` and **not published**. Never publish an item that failed a faithfulness check.
- Do not weaken these checks or prompts to save tokens or to fill a digest; an empty slot is better than an unfaithful item.
