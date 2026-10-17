import { Button, Card, Chip, Link, Modal } from '@heroui/react';
import { DIRECTION_LABEL, impactLabel, paragraphs } from '../../lib/digest.ts';
import { formatShortDate, formatTime, readingMinutes, safeUrl } from '../../lib/format.ts';
import type { DigestArticle } from '../../lib/types.ts';

type Props = {
  article: DigestArticle;
  categoryName: string | undefined;
};

const PREVIEW_CHARS = 320;

/** Rough rendered height used to balance the staggered grid (title + clamped preview + chrome). */
export function estimateCardHeight(article: DigestArticle): number {
  const preview = paragraphs(article.summary)[0] ?? '';
  return 120 + article.title.length * 0.9 + Math.min(preview.length, PREVIEW_CHARS) * 0.4;
}

function Labels({ article, categoryName }: Props) {
  const direction = article.direction ? DIRECTION_LABEL[article.direction] : null;
  const impact = impactLabel(article.impact);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {article.isPinned && <Chip size="sm" variant="primary" color="danger">Tin nóng</Chip>}
      {categoryName && <Chip size="sm" variant="secondary">{categoryName}</Chip>}
      {impact && <Chip size="sm" variant="soft" color={article.impact !== null && article.impact >= 8 ? 'warning' : 'default'}>{impact}</Chip>}
      {direction && <Chip size="sm" variant="soft" color={direction.color}>{direction.label}</Chip>}
    </div>
  );
}

function Meta({ article }: { article: DigestArticle }) {
  return (
    <p className="text-xs text-muted">
      {article.sourceName}
      {article.publishedAt && ` · ${formatTime(article.publishedAt)} ${formatShortDate(article.publishedAt)}`}
      {` · ${readingMinutes(article.summary)} phút đọc`}
    </p>
  );
}

function OriginalLink({ href }: { href: string | undefined }) {
  if (!href) return null;
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" className="text-sm">
      Đọc bài gốc
      <Link.Icon />
    </Link>
  );
}

export function DigestItemCard({ article, categoryName }: Props) {
  const parts = paragraphs(article.summary);
  const href = safeUrl(article.url);
  const accent = article.isPinned ? 'border-l-4 border-l-danger' : '';

  return (
    <Card render={(props) => <article {...props} />} className={`gap-3 p-5 ${accent}`}>
      <Card.Header className="p-0">
        <Labels article={article} categoryName={categoryName} />
      </Card.Header>

      <Card.Title className="line-clamp-4 font-serif text-lg font-semibold leading-snug">{article.title}</Card.Title>
      <Meta article={article} />

      <Card.Content className="p-0 text-[15px] leading-relaxed">
        <p className="line-clamp-5">{parts[0]}</p>
      </Card.Content>

      <Card.Footer className="flex flex-wrap items-center justify-between gap-3 p-0">
        <Modal>
          <Button size="sm" variant="secondary">Xem thêm</Button>
          <Modal.Backdrop>
            <Modal.Container size="lg" scroll="inside">
              <Modal.Dialog aria-label={article.title}>
                <Modal.CloseTrigger aria-label="Đóng" />
                <Modal.Header className="flex flex-col items-start gap-3">
                  <Labels article={article} categoryName={categoryName} />
                  <Modal.Heading className="pr-8 font-serif text-xl font-semibold leading-snug">{article.title}</Modal.Heading>
                  <Meta article={article} />
                </Modal.Header>
                <Modal.Body className="summary-text text-[15px] leading-relaxed">
                  {parts.map((p, i) => <p key={i}>{p}</p>)}
                </Modal.Body>
                <Modal.Footer className="justify-between">
                  <OriginalLink href={href} />
                  <Button size="sm" variant="ghost" slot="close">Đóng</Button>
                </Modal.Footer>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
        <OriginalLink href={href} />
      </Card.Footer>
    </Card>
  );
}
