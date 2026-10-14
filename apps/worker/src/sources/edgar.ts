import { z } from 'zod';
import type { RawItem } from '../types.ts';
import { parseDate } from './text.ts';

// SEC EDGAR submissions API: https://data.sec.gov/submissions/CIK##########.json

const FORMS_OF_INTEREST = new Set([
  '8-K', '8-K/A', '10-Q', '10-K', '6-K', 'S-1', 'S-3', 'S-3ASR', '424B2', '424B5', '13F-HR', 'SC 13D', 'SC 13G',
]);
const MAX_FILINGS = 20;

const EIGHT_K_ITEMS: Readonly<Record<string, string>> = {
  '1.01': 'Material agreement',
  '1.05': 'Cybersecurity incident',
  '2.01': 'Acquisition or disposition of assets',
  '2.02': 'Results of operations',
  '2.03': 'Financial obligation',
  '3.02': 'Unregistered sale of equity',
  '5.02': 'Officer or director change',
  '7.01': 'Regulation FD disclosure',
  '8.01': 'Other events',
};

const submissionsSchema = z.object({
  cik: z.string(),
  name: z.string(),
  filings: z.object({
    recent: z.object({
      accessionNumber: z.array(z.string()),
      acceptanceDateTime: z.array(z.string()),
      form: z.array(z.string()),
      items: z.array(z.string()),
      primaryDocument: z.array(z.string()),
    }),
  }),
});

export function parseEdgarSubmissions(json: string): RawItem[] {
  const data = submissionsSchema.parse(JSON.parse(json));
  const recent = data.filings.recent;
  const cik = String(Number(data.cik));
  const items: RawItem[] = [];

  for (let i = 0; i < recent.form.length && items.length < MAX_FILINGS; i++) {
    const form = recent.form[i] ?? '';
    const accession = recent.accessionNumber[i];
    const document = recent.primaryDocument[i];
    if (!FORMS_OF_INTEREST.has(form) || !accession || !document) continue;
    const publishedAt = parseDate(recent.acceptanceDateTime[i]);
    items.push({
      url: `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replaceAll('-', '')}/${document}`,
      title: `${data.name} — ${form}${describeItems(form, recent.items[i])}`,
      publisher: 'SEC EDGAR',
      publisherDomain: 'sec.gov',
      ...(publishedAt ? { publishedAt } : {}),
    });
  }
  return items;
}

function describeItems(form: string, items: string | undefined): string {
  if (!form.startsWith('8-K') || !items) return '';
  const names = items
    .split(',')
    .map((code) => code.trim())
    .filter((code) => code !== '9.01')
    .map((code) => EIGHT_K_ITEMS[code] ?? `Item ${code}`);
  return names.length > 0 ? `: ${names.join('; ')}` : '';
}
