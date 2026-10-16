import { useQuery } from '@tanstack/react-query';
import {
  fetchCategories, fetchDigestArticles, fetchDigests, fetchEditions, fetchEvents, fetchMarketData, fetchSlots, fetchTopics,
} from './api.ts';
import { useSupabase } from './supabase.ts';

// Server state lives in TanStack Query only (web patterns rules). Digests change twice a day,
// so data stays fresh for 5 minutes and is refetched in the background.

const FIVE_MINUTES = 5 * 60_000;
const ONE_HOUR = 60 * 60_000;

export function useTopics() {
  const db = useSupabase();
  return useQuery({ queryKey: ['topics'], queryFn: () => fetchTopics(db), staleTime: ONE_HOUR });
}

export function useEditions(topicId: string) {
  const db = useSupabase();
  return useQuery({ queryKey: ['editions', topicId], queryFn: () => fetchEditions(db, topicId), staleTime: ONE_HOUR });
}

export function useDigests(topicId: string) {
  const db = useSupabase();
  return useQuery({ queryKey: ['digests', topicId], queryFn: () => fetchDigests(db, topicId), staleTime: FIVE_MINUTES });
}

export function useDigestArticles(digestId: string | undefined) {
  const db = useSupabase();
  return useQuery({
    queryKey: ['digest', digestId],
    queryFn: () => fetchDigestArticles(db, digestId ?? ''),
    enabled: Boolean(digestId),
    staleTime: FIVE_MINUTES,
  });
}

export function useSlots(topicId: string) {
  const db = useSupabase();
  return useQuery({ queryKey: ['slots', topicId], queryFn: () => fetchSlots(db, topicId), staleTime: ONE_HOUR });
}

export function useCategories(topicId: string) {
  const db = useSupabase();
  return useQuery({ queryKey: ['categories', topicId], queryFn: () => fetchCategories(db, topicId), staleTime: ONE_HOUR });
}

export function useMarketData(topicId: string, days: number) {
  const db = useSupabase();
  return useQuery({ queryKey: ['market', topicId, days], queryFn: () => fetchMarketData(db, topicId, days), staleTime: FIVE_MINUTES });
}

export function useEvents(topicId: string) {
  const db = useSupabase();
  return useQuery({ queryKey: ['events', topicId], queryFn: () => fetchEvents(db, topicId), staleTime: FIVE_MINUTES });
}
