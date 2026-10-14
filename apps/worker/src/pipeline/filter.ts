import { OFFICIAL_AUTHORITY } from '../sources/authority.ts';
import type { Category, Entity, Source, TopicConfig } from '../types.ts';

// Keyword pre-filter (0 tokens): decides which items are worth sending to AI scoring.
// Keywords match whole words (plural "s"/"es" allowed); a trailing "*" makes a prefix match.

interface CompiledCategory {
  readonly id: string;
  readonly include: readonly RegExp[];
  readonly exclude: readonly RegExp[];
}

interface CompiledEntity {
  readonly id: string;
  readonly aliases: readonly RegExp[];
}

export interface Matcher {
  readonly exclude: readonly RegExp[];
  readonly categories: readonly CompiledCategory[];
  readonly entities: readonly CompiledEntity[];
}

export interface Classification {
  readonly relevant: boolean;
  readonly categoryId: string | null;
  readonly entityId: string | null;
}

export function compileMatcher(config: TopicConfig): Matcher {
  const byPosition = <T extends { readonly position: number }>(list: readonly T[]): T[] =>
    [...list].sort((a, b) => a.position - b.position);
  return {
    exclude: config.excludeKeywords.map(keywordPattern),
    categories: byPosition(config.categories).map((c: Category) => ({
      id: c.id,
      include: c.keywords.map(keywordPattern),
      exclude: c.excludeKeywords.map(keywordPattern),
    })),
    entities: byPosition(config.entities).map((e: Entity) => ({ id: e.id, aliases: e.aliases.map(keywordPattern) })),
  };
}

export function keywordPattern(keyword: string): RegExp {
  const trimmed = keyword.trim().toLowerCase();
  const isPrefix = trimmed.endsWith('*');
  const body = escapeRegExp(isPrefix ? trimmed.slice(0, -1) : trimmed);
  const end = isPrefix ? '' : '(?:s|es)?(?![\\p{L}\\p{N}])';
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}${end}`, 'iu');
}

export function classify(text: string, source: Source, matcher: Matcher): Classification {
  if (matcher.exclude.some((re) => re.test(text))) {
    return { relevant: false, categoryId: source.defaultCategoryId, entityId: source.defaultEntityId };
  }
  const category = matcher.categories.find(
    (c) => c.include.some((re) => re.test(text)) && !c.exclude.some((re) => re.test(text)),
  );
  const entity = matcher.entities.find((e) => e.aliases.some((re) => re.test(text)));
  return {
    relevant: Boolean(category || entity) || source.authority >= OFFICIAL_AUTHORITY,
    categoryId: category?.id ?? source.defaultCategoryId,
    entityId: entity?.id ?? source.defaultEntityId,
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
