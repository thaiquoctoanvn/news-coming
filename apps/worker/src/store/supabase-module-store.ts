import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CalendarEvent, DataModule, MarketPoint, ModuleStore } from '../modules/types.ts';

export function createSupabaseModuleStore(url: string, serviceRoleKey: string): ModuleStore {
  return new SupabaseModuleStore(createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }));
}

class SupabaseModuleStore implements ModuleStore {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async loadDataModules(topicId: string): Promise<DataModule[]> {
    const topic = await this.db.from('topics').select('id').eq('id', topicId).eq('enabled', true).maybeSingle();
    if (topic.error) throw new Error(`load topic: ${topic.error.message}`);
    if (!topic.data) return [];
    const { data, error } = await this.db.from('data_modules').select('id, connector, config').eq('topic_id', topicId).eq('enabled', true);
    if (error) throw new Error(`load data modules: ${error.message}`);
    return data as DataModule[];
  }

  async upsertMarketData(topicId: string, moduleId: string, points: readonly MarketPoint[]): Promise<void> {
    if (points.length === 0) return;
    const rows = points.map((p) => ({ topic_id: topicId, module_id: moduleId, series: p.series, obs_date: p.obsDate, value: p.value, source: p.source }));
    const { error } = await this.db.from('market_data').upsert(rows, { onConflict: 'topic_id,series,obs_date' });
    if (error) throw new Error(`upsert market data: ${error.message}`);
  }

  async upsertEvents(topicId: string, moduleId: string, events: readonly CalendarEvent[]): Promise<void> {
    if (events.length === 0) return;
    const rows = events.map((e) => ({
      topic_id: topicId, module_id: moduleId, kind: e.kind, title: e.title, title_vi: e.titleVi,
      starts_at: e.startsAt.toISOString(), importance: e.importance, source_url: e.sourceUrl,
    }));
    const { error } = await this.db.from('events').upsert(rows, { onConflict: 'topic_id,kind,starts_at,title' });
    if (error) throw new Error(`upsert events: ${error.message}`);
  }
}
