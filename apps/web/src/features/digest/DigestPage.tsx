import { Button, Tabs } from '@heroui/react';
import type { Key } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { EmptyState, ErrorState, LoadingCards } from '../../components/States.tsx';
import { chooseDigest, groupArticles } from '../../lib/digest.ts';
import { formatDigestDate } from '../../lib/format.ts';
import { useCategories, useDigestArticles, useDigests, useEditions, useSlots } from '../../lib/queries.ts';
import { DigestItemCard } from './DigestItemCard.tsx';
import { MarketStrip } from './MarketStrip.tsx';
import { UpcomingEvents } from './UpcomingEvents.tsx';

export function DigestPage() {
  const { topicId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const digests = useDigests(topicId);
  const editions = useEditions(topicId);
  const choice = chooseDigest(digests.data ?? [], params.get('date'), params.get('edition'));

  const select = (date: string, edition?: string) => {
    setParams(edition ? { date, edition } : { date });
  };
  const dateIndex = choice.date ? choice.dates.indexOf(choice.date) : -1;
  const older = choice.dates[dateIndex + 1];
  const newer = dateIndex > 0 ? choice.dates[dateIndex - 1] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <MarketStrip topicId={topicId} />

      <section aria-label="Chọn bản tin" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button isIconOnly size="sm" variant="ghost" aria-label="Ngày trước" isDisabled={!older} onPress={() => older && select(older)}>
            ‹
          </Button>
          <h1 className="font-serif text-2xl font-bold">{choice.date ? formatDigestDate(choice.date) : 'Bản tin'}</h1>
          <Button isIconOnly size="sm" variant="ghost" aria-label="Ngày sau" isDisabled={!newer} onPress={() => newer && select(newer)}>
            ›
          </Button>
        </div>
        {choice.date && (editions.data?.length ?? 0) > 1 && (
          <Tabs
            selectedKey={choice.digest?.editionId}
            onSelectionChange={(key: Key) => choice.date && select(choice.date, String(key))}
            disabledKeys={(editions.data ?? []).filter((e) => !choice.editionIds.includes(e.id)).map((e) => e.id)}
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label="Bản tin trong ngày">
                {(editions.data ?? []).map((e) => (
                  <Tabs.Tab key={e.id} id={e.id}>
                    {e.name}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        )}
      </section>

      <UpcomingEvents topicId={topicId} />

      {digests.isPending && <LoadingCards />}
      {digests.isError && <ErrorState title="Không tải được danh sách bản tin" error={digests.error} onRetry={() => void digests.refetch()} />}
      {digests.isSuccess && !choice.digest && (
        <EmptyState title="Chưa có bản tin">Bản tin sáng được tạo lúc 06:00 và bản trước phiên Mỹ lúc 08:45 giờ New York.</EmptyState>
      )}
      {choice.digest && <DigestArticles topicId={topicId} digestId={choice.digest.id} />}
    </div>
  );
}

function DigestArticles({ topicId, digestId }: { topicId: string; digestId: string }) {
  const articles = useDigestArticles(digestId);
  const slots = useSlots(topicId);
  const categories = useCategories(topicId);

  if (articles.isPending) return <LoadingCards />;
  if (articles.isError) return <ErrorState title="Không tải được bản tin" error={articles.error} onRetry={() => void articles.refetch()} />;
  if (articles.data.length === 0) {
    return <EmptyState title="Bản tin đang được chuẩn bị">Các tin đang được tóm tắt và dịch, vui lòng quay lại sau ít phút.</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-8">
      {groupArticles(articles.data, slots.data ?? []).map((group) => (
        <section key={group.key} aria-labelledby={`group-${group.key}`} className="flex flex-col gap-4">
          <h2 id={`group-${group.key}`} className={`border-b pb-1 text-xs font-semibold uppercase tracking-[0.18em] ${group.key === 'pinned' ? 'border-danger text-danger' : 'border-border text-muted'}`}>
            {group.label}
          </h2>
          {group.articles.map((a) => (
            <DigestItemCard key={a.id} article={a} categoryName={a.categoryId ? categories.data?.get(a.categoryId) : undefined} />
          ))}
        </section>
      ))}
    </div>
  );
}
