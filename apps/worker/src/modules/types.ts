// Data modules (DESIGN.md §7.2): market series and calendar events, collected without AI.

export interface MarketPoint {
  readonly series: string;
  /** YYYY-MM-DD in the market's own time zone. */
  readonly obsDate: string;
  readonly value: number;
  readonly source: string;
}

export interface CalendarEvent {
  readonly kind: string;
  /** English title, also the stable identity of the event together with kind and time. */
  readonly title: string;
  /** Vietnamese title from a fixed glossary (no AI, nothing to verify). */
  readonly titleVi: string;
  readonly startsAt: Date;
  /** 1 = minor … 3 = market moving. */
  readonly importance: 1 | 2 | 3;
  readonly sourceUrl: string;
}

export interface DataModule {
  readonly id: string;
  readonly connector: string;
  readonly config: Readonly<Record<string, unknown>>;
}

export interface ModuleStore {
  /** Enabled modules of an enabled topic. */
  loadDataModules(topicId: string): Promise<DataModule[]>;
  upsertMarketData(topicId: string, moduleId: string, points: readonly MarketPoint[]): Promise<void>;
  upsertEvents(topicId: string, moduleId: string, events: readonly CalendarEvent[]): Promise<void>;
}

export interface ModuleContext {
  readonly fetchText: (url: string, headers?: Readonly<Record<string, string>>) => Promise<string>;
  readonly fredApiKey: string | undefined;
  readonly eiaApiKey: string | undefined;
  readonly now: Date;
}
