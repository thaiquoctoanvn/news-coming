import { Button } from '@heroui/react';
import { useParams, useSearchParams } from 'react-router';
import { MasonryGrid } from '../../components/MasonryGrid.tsx';
import { SegmentedTabs } from '../../components/SegmentedTabs.tsx';
import { EmptyState, ErrorState, LoadingCards } from '../../components/States.tsx';
import { chooseDigest, orderArticles } from '../../lib/digest.ts';
import { formatDigestDate } from '../../lib/format.ts';
import { useCategories, useDigestArticles, useDigests, useEditions } from '../../lib/queries.ts';
import { AdminDigestActions } from './AdminDigestActions.tsx';
import { DigestItemCard, estimateCardHeight } from './DigestItemCard.tsx';
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
        <div className="flex min-w-0 items-center gap-2">
          <Button isIconOnly size="sm" variant="ghost" aria-label="Ngày trước" isDisabled={!older} onPress={() => older && select(older)}>
            ‹
          </Button>
          <h1 className="min-w-0 truncate font-serif text-2xl font-bold">{choice.date ? formatDigestDate(choice.date) : 'Bản tin'}</h1>
          <Button isIconOnly size="sm" variant="ghost" aria-label="Ngày sau" isDisabled={!newer} onPress={() => newer && select(newer)}>
            ›
          </Button>
        </div>
        {choice.date && (editions.data?.length ?? 0) > 1 && (
          <SegmentedTabs
            ariaLabel="Bản tin trong ngày"
            className="w-full sm:w-auto sm:max-w-md"
            items={(editions.data ?? []).map((e) => ({ id: e.id, label: e.name }))}
            selectedKey={choice.digest?.editionId}
            onChange={(id) => choice.date && select(choice.date, id)}
            disabledKeys={(editions.data ?? []).filter((e) => !choice.editionIds.includes(e.id)).map((e) => e.id)}
          />
        )}
      </section>

      <UpcomingEvents topicId={topicId} />

      {digests.isPending && <LoadingCards />}
      {digests.isError && <ErrorState title="Không tải được danh sách bản tin" error={digests.error} onRetry={() => void digests.refetch()} />}
      {digests.isSuccess && !choice.digest && (
        <EmptyState title="Chưa có bản tin">Bản tin sáng được tạo lúc 06:00 và bản trước phiên Mỹ lúc 08:45 giờ New York.</EmptyState>
      )}
      {choice.digest && <DigestArticles topicId={topicId} digestId={choice.digest.id} />}
      {choice.digest && <AdminDigestActions digestId={choice.digest.id} />}
    </div>
  );
}

function DigestArticles({ topicId, digestId }: { topicId: string; digestId: string }) {
  const articles = useDigestArticles(digestId);
  const categories = useCategories(topicId);

  if (articles.isPending) return <LoadingCards />;
  if (articles.isError) return <ErrorState title="Không tải được bản tin" error={articles.error} onRetry={() => void articles.refetch()} />;
  if (articles.data.length === 0) {
    return <EmptyState title="Bản tin đang được chuẩn bị">Các tin đang được tóm tắt và dịch, vui lòng quay lại sau ít phút.</EmptyState>;
  }

  return (
    <MasonryGrid
      items={orderArticles(articles.data)}
      getKey={(a) => a.id}
      estimate={estimateCardHeight}
      renderItem={(a) => <DigestItemCard article={a} categoryName={a.categoryId ? categories.data?.get(a.categoryId) : undefined} />}
    />
  );
}
