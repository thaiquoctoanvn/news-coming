import type { ClusterHead } from '../types.ts';
import { shortHash, titleTokens } from './normalize.ts';

// Groups items that report the same story (title similarity), so the story is scored once
// and the number of outlets covering it boosts its score (source_count).

export const SIMILARITY_THRESHOLD = 0.5;
const MIN_TOKENS = 3;

export interface ClusterInput {
  readonly title: string;
  readonly sourceId: string;
  readonly publisher: string;
}

export type ClusterResult =
  | { readonly kind: 'new'; readonly clusterKey: string }
  | { readonly kind: 'duplicate-of-head'; readonly clusterKey: string; readonly headId: string }
  | { readonly kind: 'duplicate-of-batch'; readonly clusterKey: string; readonly index: number };

interface Representative {
  readonly tokens: Set<string>;
  readonly clusterKey: string;
  readonly sourceId: string | null;
  readonly publisher: string;
  readonly headId: string | null;
  readonly index: number | null;
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * Assigns each input (already sorted by priority: authority desc, then oldest first) to a cluster.
 * Items from the same source and publisher never merge — e.g. two EDGAR 8-K filings are different events.
 */
export function assignClusters(inputs: readonly ClusterInput[], heads: readonly ClusterHead[]): ClusterResult[] {
  const reps: Representative[] = heads.map((head) => ({
    tokens: titleTokens(head.title),
    clusterKey: head.clusterKey,
    sourceId: head.sourceId,
    publisher: head.sourceName,
    headId: head.id,
    index: null,
  }));

  return inputs.map((input, index): ClusterResult => {
    const tokens = titleTokens(input.title);
    const match = tokens.size >= MIN_TOKENS ? bestMatch(tokens, input, reps) : undefined;
    if (match?.headId) return { kind: 'duplicate-of-head', clusterKey: match.clusterKey, headId: match.headId };
    if (match && match.index !== null) return { kind: 'duplicate-of-batch', clusterKey: match.clusterKey, index: match.index };

    const clusterKey = shortHash(`${[...tokens].sort().join(' ')}|${input.sourceId}|${index}|${input.title}`);
    reps.push({ tokens, clusterKey, sourceId: input.sourceId, publisher: input.publisher, headId: null, index });
    return { kind: 'new', clusterKey };
  });
}

function bestMatch(tokens: Set<string>, input: ClusterInput, reps: readonly Representative[]): Representative | undefined {
  let best: Representative | undefined;
  let bestScore = SIMILARITY_THRESHOLD;
  for (const rep of reps) {
    if (rep.sourceId === input.sourceId && rep.publisher === input.publisher) continue;
    const score = jaccard(tokens, rep.tokens);
    if (score >= bestScore) {
      best = rep;
      bestScore = score;
    }
  }
  return best;
}
