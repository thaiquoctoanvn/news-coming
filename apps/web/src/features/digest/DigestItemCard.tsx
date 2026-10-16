import { Button, Card, Chip, Link } from '@heroui/react';
import { useState } from 'react';
import { DIRECTION_LABEL, impactLabel, paragraphs } from '../../lib/digest.ts';
import { formatShortDate, formatTime, readingMinutes, safeUrl } from '../../lib/format.ts';
import type { DigestArticle } from '../../lib/types.ts';

type Props = {
  article: DigestArticle;
  categoryName: string | undefined;
};

export function DigestItemCard({ article, categoryName }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const parts = paragraphs(article.summary);
  const visible = isExpanded ? parts : parts.slice(0, 1);
  const direction = article.direction ? DIRECTION_LABEL[article.direction] : null;
  const impact = impactLabel(article.impact);
  const href = safeUrl(article.url);
  const accent = article.isPinned ? 'border-l-4 border-l-danger' : '';

  return (
    <Card render={(props) => <article {...props} />} className={`gap-3 p-5 ${accent}`}>
      <Card.Header className="flex flex-wrap items-center gap-2 p-0">
        {categoryName && <Chip size="sm" variant="secondary">{categoryName}</Chip>}
        {impact && <Chip size="sm" variant="soft" color={article.impact !== null && article.impact >= 8 ? 'warning' : 'default'}>{impact}</Chip>}
        {direction && <Chip size="sm" variant="soft" color={direction.color}>{direction.label}</Chip>}
      </Card.Header>

      <Card.Title className="font-serif text-xl font-semibold leading-snug">{article.title}</Card.Title>

      <p className="text-xs text-muted">
        {article.sourceName}
        {article.publishedAt && ` · ${formatTime(article.publishedAt)} ${formatShortDate(article.publishedAt)}`}
        {` · ${readingMinutes(article.summary)} phút đọc`}
      </p>

      <Card.Content className="summary-text p-0 text-[15px] leading-relaxed">
        {visible.map((p, i) => <p key={i}>{p}</p>)}
      </Card.Content>

      <Card.Footer className="flex flex-wrap items-center gap-3 p-0">
        {parts.length > 1 && (
          <Button size="sm" variant="ghost" aria-expanded={isExpanded} onPress={() => setIsExpanded((v) => !v)}>
            {isExpanded ? 'Thu gọn' : `Đọc tiếp (${parts.length - 1} đoạn)`}
          </Button>
        )}
        {href && (
          <Link href={href} target="_blank" rel="noopener noreferrer" className="text-sm">
            Đọc bài gốc
            <Link.Icon />
          </Link>
        )}
      </Card.Footer>
    </Card>
  );
}
