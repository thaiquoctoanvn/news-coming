# news-coming — Thiết kế hệ thống

Hệ thống bản tin theo **topic**: mỗi topic tự động lấy tin từ nguồn đã cấu hình, chấm điểm, tóm tắt, dịch sang tiếng Việt và hiển thị trên web. Topic đầu tiên: **Vĩ mô / Tài chính**.

> **Rule cứng:** 100% free tier. Mọi quyết định thiết kế ưu tiên (1) không phát sinh chi phí, (2) tiêu thụ token tối thiểu, (3) hết quota thì chậm lại chứ không gián đoạn.

---

## 1. Quyết định đã chốt

| # | Hạng mục | Quyết định |
|---|---|---|
| 1 | Tổ chức dữ liệu | **Topic là cấp cao nhất.** Mọi thứ (danh mục, tổ chức, nguồn, slot, lịch chạy, số liệu, lịch sự kiện, bản tin, quota) thuộc về 1 topic. Mỗi cấp đều bật/tắt được |
| 2 | DB / Auth | Supabase Free (Postgres + RLS + Auth + Edge Functions + Realtime + pg_cron) |
| 3 | Web | Vite + React SPA + HeroUI v3 + Tailwind v4, deploy Netlify (chỉ static, không SSR) |
| 4 | Worker | Node.js/TypeScript chạy trên GitHub Actions (repo **public** → không giới hạn phút) |
| 5 | Lập lịch | Lịch chạy cấu hình theo topic trong DB; Supabase pg_cron kiểm tra và gọi GitHub `workflow_dispatch` |
| 6 | Nguồn tin | **Không dùng X.** Nguồn chính thức + RSS báo lớn + Google News RSS + SEC EDGAR |
| 7 | AI | Model A (Groq) chấm điểm + tóm tắt; Model B (Gemini) dịch. Fallback chain cấu hình trong DB. Prompt dựng động theo cấu hình topic |
| 8 | Bản tin | Mỗi topic có các edition riêng. Vĩ mô/Tài chính: **Sáng** (06:00 VN, 10–12 tin) + **Trước phiên Mỹ** (08:45 ET, 6–8 tin) |
| 9 | Xem thêm | "Xem thêm" dịch tiếp tin trong kho dự trữ; "Cập nhật tin mới" chạy lại pipeline của topic. Chỉ admin, giới hạn lượt/ngày theo topic |
| 10 | Truy cập web | Bản tin của topic đang bật là public. Cấu hình + nút tốn quota chỉ admin |
| 11 | Đăng nhập | Username cố định → OTP 6 số gửi email chỉ định (qua **Resend**) → session tối đa 15 ngày |
| 12 | CI/CD | Push/merge vào `main` → GitHub Actions tự kiểm tra rồi deploy phần thay đổi: DB migrations → Edge Functions → Web (Netlify) → dời tag `prod` cho worker (§13) |

---

## 2. Mô hình topic

```
Topic  (bật/tắt, quota AI riêng, hướng dẫn chấm điểm riêng)
 ├─ Categories      danh mục con + từ khóa                    (bật/tắt)
 ├─ Entities        tổ chức theo dõi                           (bật/tắt)
 ├─ Sources         nguồn tin, gắn sẵn category/entity nếu có  (bật/tắt)
 ├─ Digest slots    thứ tự ưu tiên khi chọn tin                (bật/tắt)
 ├─ Editions        các bản tin + giờ chạy + kích thước        (bật/tắt)
 ├─ Data modules    số liệu / lịch sự kiện                     (bật/tắt)
 └─ Dữ liệu sinh ra: articles, digests, market_data, events, crawl_runs
```

### 2.1 Quy tắc bật/tắt

- **Hiệu lực = cha bật VÀ con bật.** Tắt topic → toàn bộ con ngừng hoạt động nhưng giữ nguyên cấu hình, bật lại là chạy tiếp.
- Topic tắt: worker không fetch, không gọi AI, không tốn quota; web public ẩn topic (dữ liệu cũ vẫn giữ trong DB, admin vẫn xem được).
- Tắt source / category / entity / slot / edition / data module: chỉ phần đó ngừng, phần còn lại của topic chạy bình thường.
- Thay đổi có hiệu lực từ lần chạy kế tiếp, không cần deploy.

### 2.2 Thêm topic mới

| Loại nội dung | Cần code? |
|---|---|
| Tin tức (categories, entities, sources dạng RSS / Google News / EDGAR / GDELT, slots, editions, hướng dẫn chấm điểm) | **Không** — tạo hoàn toàn trên trang Cấu hình |
| Data module mới (loại số liệu / lịch chưa có connector) | Có — viết connector mới, sau đó bật cho topic bất kỳ |

Prompt chấm điểm không hardcode cho tài chính: được dựng từ `topics.scoring_guide` + danh sách categories + entities của topic.

### 2.3 Cấu hình topic "Vĩ mô / Tài chính" (seed)

| Thành phần | Nội dung |
|---|---|
| Categories | `oil` Dầu · `fed` FED · `treasury` Bộ Tài chính Mỹ · `yield_us` Lợi suất Mỹ · `yield_jp` Lợi suất Nhật · `institution` Tổ chức · `geo` Địa chính trị · `gold` Vàng · `tokenization` Token hóa tài sản · `crypto` Crypto khác · `other` Khác |
| Entities | Strategy, BitMine, Coinbase, Circle, BlackRock (+ Vanguard, Grayscale, Binance — tắt sẵn hoặc chỉ dùng cho slot "Còn lại") |
| Data modules | `oil_price` (WTI/Brent) · `us_yields` (2Y/10Y/30Y) · `jp_yields` (JGB 10Y/30Y) · `macro_calendar` (FOMC, CPI, NFP, PCE, đấu giá TPCP, BOJ) |
| Editions | `morning` 06:00 Asia/Ho_Chi_Minh hằng ngày, 10–12 tin · `pre_us` 08:45 America/New_York T2–T6, 6–8 tin |
| Slots | §5 |
| Sources | §7 |

---

## 3. Kiến trúc

```
┌─────────────────────────────── Supabase ───────────────────────────────────┐
│ pg_cron (mỗi 5'): tìm edition đến hạn của topic đang bật                    │
│        └─ pg_net → GitHub workflow_dispatch(topic_id, edition_id)          │
│ Postgres + RLS · Auth (email OTP, SMTP = Resend) · Realtime                 │
│ Edge Functions: request-otp · more-news · trigger-refresh                  │
└──────────────┬──────────────────────────────────▲──────────────────────────┘
               │ dispatch                          │ service_role key
               ▼                                   │
┌──────────── GitHub Actions ─────────────────────┴──────────────────────────┐
│ worker run --topic <id> --edition <id>                                     │
│   data modules → news pipeline → digest                                    │
│ schedule dự phòng 1 lần/ngày: chạy các edition bị lỡ                       │
└────────────────────────────────────────────────────────────────────────────┘
               ▲ publishable/anon key + RLS
               │
Netlify (static SPA): chọn topic → Bản tin · Lịch · Biểu đồ · Cấu hình · Vận hành
```

### 3.1 Lập lịch

- `editions` lưu `timezone`, `local_time`, `weekdays` → tự xử lý giờ mùa hè/đông (08:45 ET = 19:45 VN mùa hè, 20:45 VN mùa đông).
- pg_cron chạy mỗi 5 phút một câu SQL nhẹ: edition nào đã đến giờ, chưa có `crawl_runs` thành công hôm nay, và topic + edition đều bật → dispatch. Không tốn gì khi không có việc.
- Workflow chạy bằng `workflow_dispatch` không bị GitHub tắt sau 60 ngày repo không hoạt động.
- GitHub `schedule` 1 lần/ngày làm dự phòng: worker tự kiểm tra và chạy bù edition bị lỡ.
- Job hằng ngày giữ Supabase không bị pause (7 ngày không hoạt động).
- `concurrency` group theo topic để 2 lần chạy cùng topic không chồng nhau.

### 3.2 Ba loại dữ liệu trong một topic

| Loại | Bảng | AI? |
|---|---|---|
| Tin tức | `articles`, `digests`, `digest_items` | Có |
| Số liệu | `market_data` (thuộc data module) | Không |
| Lịch sự kiện | `events` (thuộc data module) | Chỉ dịch tên sự kiện 1 lần, cache |

---

## 4. Pipeline tin tức (chạy cho 1 topic + 1 edition)

```
1. Fetch các source đang bật của topic, trong cửa sổ thời gian của edition  [0 token]
2. Chuẩn hóa URL → url_hash → bỏ bài đã có trong topic                       [0 token]
3. Gom cụm cùng sự kiện (cluster_key) → source_count                         [0 token]
4. Lọc từ khóa theo categories/entities đang bật                             [0 token]
5. Model A chấm điểm theo lô 25 tiêu đề/request (JSON)                         [~5 req]
6. Tính final_score bằng code, chọn tin theo slots của topic (§5)
7. Tin được chọn: đọc nội dung (Readability → fallback Jina Reader),
   cắt ~800 token → Model A tóm tắt, lô 4–6 tin/request                       [~2–3 req]
8. Model B dịch title + summary, lô 6 tin/request                              [~2 req]
9. Ghi digest + digest_items; tin còn lại giữ status = 'scored' (kho dự trữ)
```

- Mỗi bước chỉ xử lý bản ghi ở trạng thái tương ứng → chạy lại an toàn. Hết quota → giữ trạng thái, lần sau chạy tiếp.
- Mỗi request AI được kiểm tra với quota của provider **và** `topics.ai_daily_request_cap`, để một topic không ăn hết quota của topic khác.
- Trạng thái: `raw → filtered_out | scored → selected → summarized → translated` (+ `failed`).

### 4.1 Output chấm điểm của Model A

```json
{ "id": "…", "category": "<id trong categories của topic>",
  "entity": "<id trong entities của topic | null>",
  "impact": 0-10, "direction": "negative|neutral|positive",
  "explains": "<data module id mà tin giải thích biến động, vd 'oil_price' | null>",
  "reason": "one short sentence" }
```

Thang `impact` lấy từ `topics.scoring_guide`. Với Vĩ mô / Tài chính:
- **9–10**: FED đổi lãi suất khẩn cấp; xung đột ảnh hưởng nguồn cung dầu (Hormuz…); sàn lớn bị hack/mất thanh khoản; Strategy buộc bán BTC; lợi suất JGB tăng sốc.
- **7–8**: quyết định FOMC; CPI/NFP lệch mạnh dự báo; OPEC+ đổi sản lượng; ETF lớn được duyệt/từ chối.
- **4–6**: phát biểu quan chức FED; giao dịch của tổ chức; kết quả đấu giá trái phiếu.
- **0–3**: bình luận, dự báo, PR.

### 4.2 Điểm cuối (tính bằng code)

```
final_score = impact × 10
            + (source_count − 1) × 3            // tối đa +15
            + source.authority                    // chính thức +10, Reuters/Bloomberg +5, khác 0
            − max(0, giờ_tuổi − 18) × 1          // phạt tin cũ
```

---

## 5. Thuật toán chọn tin

**Bước 0 — Ghim tin cực mạnh:** theo `topics.settings.pin` (Vĩ mô/Tài chính: `impact ≥ 9 AND direction = 'negative'`, tối đa 3). Lên đầu bất kể category, vẫn tính vào tổng.

**Bước 1 — Lấp slot theo `position`** (bảng `digest_slots`, sửa trên web). Kiểu slot:

| `kind` | Hành vi |
|---|---|
| `category` | Lấy tin điểm cao nhất thuộc `category_ids`, tối đa `max_items` |
| `per_entity` | Mỗi entity trong `entity_ids` lấy 1 tin; entity không có tin đạt sàn thì bỏ trống |
| `fill` | Lấp đến kích thước edition theo `final_score` giảm dần |

Slot có `attach_module` → hiển thị card số liệu của module đó và ưu tiên tin có `explains = attach_module`.

Seed cho Vĩ mô / Tài chính:

| Pos | Slot | kind | category / entity | Số tin | Sàn | attach_module |
|---|---|---|---|---|---|---|
| 1 | Giá dầu | category | oil | 1 (tin giải thích nguyên nhân) | 40 | oil_price |
| 2 | FED | category | fed | 1–2 (tin 2 nếu ≥ 70) | 40 | — |
| 3 | Lợi suất Mỹ + Nhật | category | yield_us, yield_jp | 1 | 40 | us_yields, jp_yields |
| 4 | Tổ chức | per_entity | Strategy, BitMine, Coinbase, Circle, BlackRock | 0–5 | 35 | — |
| 5 | Địa chính trị + Vàng | category | geo, gold | 1–2 | 45 | — |
| 6 | Còn lại | fill | tất cả | phần còn lại | 50 | — |

Edition `pre_us` chỉ xét tin sau `window_end` của edition trước cùng ngày, loại tin đã xuất hiện, và kèm sự kiện trong phiên Mỹ hôm đó.

Thứ tự hiển thị: tin ghim → slot theo `position`.

---

## 6. "Xem thêm" và "Cập nhật tin mới"

| Nút | Cơ chế | Chi phí | Thời gian |
|---|---|---|---|
| Xem thêm | Edge Function `more-news(digest_id)`: lấy 5–8 tin `scored` tiếp theo của digest đó → tóm tắt + dịch → thêm `digest_items` (`added_by = 'more'`) | ~2 req | 10–20 s |
| Cập nhật tin mới | Edge Function `trigger-refresh(topic_id)` → `workflow_dispatch` → pipeline cho cửa sổ từ lần chạy trước; web theo dõi qua Realtime | ~7–9 req | 2–3 phút |

- Chỉ admin thấy nút; topic tắt thì nút bị khóa.
- Giới hạn lượt/ngày theo topic trong `topics.settings` (mặc định Xem thêm 5, Cập nhật 3), đếm trong `action_quota`.
- Kết quả lưu DB → người xem public thấy luôn.
- Edge Function giới hạn 150s (free) → mỗi lần "Xem thêm" ≤ 8 tin.

---

## 7. Nguồn dữ liệu — topic Vĩ mô / Tài chính

> URL cần verify bằng script ở Phase 1.

### 7.1 Tin tức (`sources`)

| Category / Entity | Nguồn | Endpoint | Authority |
|---|---|---|---|
| fed | Fed press (all / monetary) | `https://www.federalreserve.gov/feeds/press_all.xml`, `.../feeds/press_monetary.xml` | +10 |
| fed | Fed speeches | `https://www.federalreserve.gov/feeds/speeches.xml` | +10 |
| treasury | Treasury press releases | `home.treasury.gov/news/press-releases` (RSS/HTML — verify) | +10 |
| yield_jp | BOJ / MOF Japan | trang thông báo BOJ, MOF (verify RSS) | +10 |
| entities | SEC EDGAR | `https://data.sec.gov/submissions/CIK##########.json` (8-K, 10-Q, 13F, S-1). Header bắt buộc `User-Agent: news-coming <email>` | +10 |
| entities | Newsroom/blog Coinbase, Circle, BlackRock, Grayscale, Binance | RSS/JSON từng trang (verify) | +5 |
| mọi category | Google News RSS theo query | `https://news.google.com/rss/search?q=<query>+when:1d&hl=en-US&gl=US&ceid=US:en` | theo domain gốc |
| crypto, tokenization | CoinDesk, The Block | `https://www.coindesk.com/arc/outboundfeeds/rss/`, `https://www.theblock.co/rss.xml` | 0 |
| geo | GDELT DOC API | `https://api.gdeltproject.org/api/v2/doc/doc?query=…&mode=artlist&format=json` | 0 |

Query Google News khởi điểm (mỗi query là 1 source):
- oil: `oil prices OR brent OR WTI OR OPEC`
- fed: `"Federal Reserve" OR FOMC OR Powell`
- yield_us: `"Treasury yields" OR "10-year yield"` · yield_jp: `"JGB yields" OR "Bank of Japan"`
- entities: `"Strategy" MSTR bitcoin` · `BitMine BMNR` · `Coinbase` · `"Circle" USDC` · `BlackRock (bitcoin OR ETF OR tokenized)`
- geo: `war OR sanctions OR geopolitical tensions markets`
- gold: `gold prices OR "central bank gold"`
- tokenization: `tokenization OR "tokenized treasuries" OR RWA`

### 7.2 Data modules

| Module | Loại | Nguồn | Ghi chú |
|---|---|---|---|
| `us_yields` | số liệu | Treasury Daily Yield Curve XML; dự phòng FRED (`DGS2`, `DGS10`, `DGS30`) | FRED key free |
| `jp_yields` | số liệu | MOF Japan `jgbcme.csv` | trễ 1 ngày làm việc |
| `oil_price` | số liệu | Stooq/Yahoo (gần realtime, **không chính thức**) → dự phòng EIA API v2 (`RWTC`, `RBRTE`) | EIA key free, trễ ~1 ngày |
| `macro_calendar` | lịch | FOMC (HTML `fomccalendars.htm`), BLS `.ics`, lịch BEA, Treasury FiscalData `/v1/accounting/od/auctions_query`, lịch BOJ | |

---

## 8. AI providers (dùng chung mọi topic)

| Role | Chính | Fallback 1 | Fallback cuối |
|---|---|---|---|
| `extract` (chấm điểm, tóm tắt) | Groq (Llama / gpt-oss) | Cerebras / Mistral free | dừng, giữ `scored`, chạy tiếp lần sau |
| `translate` | Gemini Flash / Flash-Lite | Cloudflare Workers AI | giữ bản EN, đánh dấu chờ dịch |

- Model, thứ tự, `daily_request_limit`, `rpm_limit` trong `ai_providers`.
- `ai_usage` đếm theo provider + topic + ngày; chạm 80% limit provider → chuyển provider kế tiếp; chạm `ai_daily_request_cap` của topic → topic đó dừng gọi AI trong ngày.
- JSON output; retry exponential backoff khi 429/5xx.
- Ước tính topic Vĩ mô / Tài chính: Sáng ~10 req, Trước phiên Mỹ ~7 req, mỗi "Xem thêm" +2 → < 40 req/ngày. Cap mặc định 60.

---

## 9. Schema DB (draft)

```sql
create type article_status as enum ('raw','filtered_out','scored','selected','summarized','translated','failed');
create type source_kind    as enum ('rss','google_news','edgar','gdelt','html','json');
create type slot_kind      as enum ('category','per_entity','fill');

-- ===== Cấu hình =====
create table topics (
  id text primary key,                         -- 'macro_finance'
  name_vi text not null,                       -- 'Vĩ mô / Tài chính'
  description_vi text,
  position smallint not null default 0,
  enabled boolean not null default true,
  scoring_guide text not null,                 -- thang impact + ví dụ, chèn vào prompt
  ai_daily_request_cap int not null default 60,
  settings jsonb not null default '{}'         -- pin rule, more_batch_size, daily_cap_more, daily_cap_refresh, retention
);

create table categories (
  topic_id text references topics on delete cascade,
  id text not null,                            -- 'oil','fed',...
  name_vi text not null,
  keywords text[] not null default '{}',
  exclude_keywords text[] not null default '{}',
  position smallint not null default 0,
  enabled boolean not null default true,
  primary key (topic_id, id)
);

create table entities (
  topic_id text references topics on delete cascade,
  id text not null,                            -- 'strategy','bitmine',...
  name text not null,
  aliases text[] not null default '{}',
  sec_cik text,
  enabled boolean not null default true,
  primary key (topic_id, id)
);

create table sources (
  id uuid primary key default gen_random_uuid(),
  topic_id text not null references topics on delete cascade,
  name text not null,
  kind source_kind not null,
  url text,
  query text,
  default_category_id text,                    -- (topic_id, default_category_id) → categories
  default_entity_id text,                      -- (topic_id, default_entity_id)   → entities
  authority smallint not null default 0,
  enabled boolean not null default true,
  last_fetched_at timestamptz,
  last_error text
);

create table data_modules (
  topic_id text references topics on delete cascade,
  id text not null,                            -- 'oil_price','us_yields','jp_yields','macro_calendar'
  connector text not null,                     -- tên connector trong code
  name_vi text not null,
  config jsonb not null default '{}',          -- series, nguồn chính/dự phòng
  enabled boolean not null default true,
  primary key (topic_id, id)
);

create table editions (
  topic_id text references topics on delete cascade,
  id text not null,                            -- 'morning','pre_us'
  name_vi text not null,
  timezone text not null,                      -- 'Asia/Ho_Chi_Minh','America/New_York'
  local_time time not null,
  weekdays smallint[] not null default '{1,2,3,4,5,6,7}',
  size_min smallint not null,
  size_max smallint not null,
  run_modules boolean not null default true,   -- có chạy data modules trong edition này không
  enabled boolean not null default true,
  primary key (topic_id, id)
);

create table digest_slots (
  topic_id text references topics on delete cascade,
  id text not null,
  position smallint not null,
  label_vi text not null,
  kind slot_kind not null,
  category_ids text[] not null default '{}',
  entity_ids text[] not null default '{}',
  min_items smallint not null default 0,
  max_items smallint not null default 1,
  min_score int not null default 0,
  attach_modules text[] not null default '{}',
  enabled boolean not null default true,
  primary key (topic_id, id)
);

-- ===== Dữ liệu =====
create table articles (
  id uuid primary key default gen_random_uuid(),
  topic_id text not null references topics on delete cascade,
  source_id uuid references sources on delete set null,
  url text not null,
  url_hash text not null,
  cluster_key text,
  title text not null,
  description text,
  content_snippet text,
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  status article_status not null default 'raw',
  category_id text,
  entity_id text,
  impact smallint,
  direction text,
  explains text,                               -- data module id
  ai_reason text,
  source_count int not null default 1,
  final_score int,
  summary_en text,
  title_vi text,
  summary_vi text,
  translated_at timestamptz,
  error text,
  unique (topic_id, url_hash)
);
create index on articles (topic_id, status, final_score desc);
create index on articles (topic_id, published_at desc);

create table digests (
  id uuid primary key default gen_random_uuid(),
  topic_id text not null,
  edition_id text not null,
  digest_date date not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (topic_id, edition_id) references editions on delete cascade,
  unique (topic_id, edition_id, digest_date)
);

create table digest_items (
  digest_id uuid references digests on delete cascade,
  article_id uuid references articles on delete cascade,
  position smallint not null,
  slot_id text,
  is_pinned boolean not null default false,
  added_by text not null default 'auto',       -- 'auto' | 'more'
  primary key (digest_id, article_id)
);

create table market_data (
  topic_id text not null,
  module_id text not null,
  series text not null,                        -- 'US10Y','JP10Y','WTI','BRENT',...
  obs_date date not null,
  value numeric not null,
  source text not null,
  foreign key (topic_id, module_id) references data_modules on delete cascade,
  primary key (topic_id, series, obs_date)
);

create table events (
  id uuid primary key default gen_random_uuid(),
  topic_id text not null,
  module_id text not null,
  kind text not null,                          -- 'fomc','cpi','nfp','auction','boj',...
  title text not null,
  title_vi text,
  starts_at timestamptz not null,
  importance smallint not null default 2,
  source_url text,
  foreign key (topic_id, module_id) references data_modules on delete cascade,
  unique (topic_id, kind, starts_at, title)
);

-- ===== Vận hành =====
create table crawl_runs (
  id uuid primary key default gen_random_uuid(),
  topic_id text not null references topics on delete cascade,
  edition_id text,
  trigger text not null,                       -- 'schedule' | 'manual' | 'backup'
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  stats jsonb not null default '{}',
  error text
);

create table ai_providers (
  id text primary key,
  role text not null,                          -- 'extract' | 'translate'
  provider text not null,
  model text not null,
  priority smallint not null,
  daily_request_limit int not null,
  rpm_limit int not null,
  enabled boolean not null default true
);

create table ai_usage (
  provider_id text references ai_providers,
  topic_id text references topics on delete cascade,
  usage_date date not null,
  requests int not null default 0,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  primary key (provider_id, topic_id, usage_date)
);

create table action_quota (
  topic_id text references topics on delete cascade,
  action text not null,                        -- 'more' | 'refresh'
  usage_date date not null,
  count int not null default 0,
  primary key (topic_id, action, usage_date)
);

create table app_settings (key text primary key, value jsonb not null);  -- cấu hình toàn hệ thống

create table login_attempts (
  ip_hash text not null,
  attempted_at timestamptz not null default now()
);
```

Các khóa ngoại phức hợp còn thiếu trong draft (`sources`, `articles` → `categories`/`entities`) sẽ bổ sung ở migration thật.

---

## 10. Bảo mật

### 10.1 RLS

```sql
-- Admin hợp lệ = đã đăng nhập và lần verify OTP gần nhất trong 15 ngày
create function is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users
    where id = auth.uid()
      and last_sign_in_at > now() - interval '15 days'
  );
$$;
```

| Bảng | anon (public) | admin | worker |
|---|---|---|---|
| `topics` | select khi `enabled` (chỉ cột hiển thị) | all | service_role |
| `digests`, `digest_items`, `market_data`, `events`, `editions`, `data_modules` | select khi topic `enabled` | all / select | service_role |
| `articles` | select qua view `published_articles` (topic bật, status `translated`, chỉ cột VI + url + nguồn) | select | service_role |
| `categories`, `entities`, `sources`, `digest_slots`, `ai_providers`, `app_settings` | — | all | service_role |
| `crawl_runs`, `ai_usage`, `action_quota` | — | select | service_role |
| `login_attempts` | — | — | chỉ Edge Function |

### 10.2 Đăng nhập

1. Web gửi username → Edge Function `request-otp`.
2. Function: rate-limit theo IP hash (5 lần/giờ) → so sánh với secret `ADMIN_USERNAME` → nếu khớp gọi `signInWithOtp({ email: ADMIN_EMAIL, options: { shouldCreateUser: false } })`.
3. Luôn trả cùng một thông báo → không dò được username. Email đích không xuống frontend.
4. Web gọi `verifyOtp` với mã 6 số → session.
5. Session 15 ngày: enforce ở DB qua `is_admin()` (time-box của Supabase là tính năng trả phí); web tự `signOut()` khi quá hạn.

Cấu hình Supabase Auth:
- Tắt **Allow new users to sign up**; tạo sẵn 1 user `ADMIN_EMAIL`.
- OTP 6 số, hết hạn 600s; template dùng `{{ .Token }}`.
- Custom SMTP = Resend: host `smtp.resend.com`, port `465`, user `resend`, password = Resend API key, sender `noreply@<domain>`.
- Resend: verify domain (SPF + DKIM). Free 100 email/ngày, 3.000/tháng.

### 10.3 Repo public

- Secret chỉ ở GitHub Secrets / Supabase Secrets; commit `.env.example`, không commit `.env`.
- Bật Secret scanning + Push protection.
- Workflow chỉ dùng `schedule` + `workflow_dispatch`; không dùng `pull_request_target`.
- Test RLS: anon không đọc/ghi được bảng cấu hình, không thấy topic tắt.
- Web public chỉ hiển thị tóm tắt tiếng Việt + link gốc.

---

## 11. Web

Điều hướng: thanh chọn **topic** (chỉ topic đang bật với public; admin thấy cả topic tắt, có nhãn "Đã tắt").

| Trang (trong 1 topic) | Quyền | Nội dung |
|---|---|---|
| Bản tin | public | Chọn ngày + edition; tin ghim; card số liệu theo slot; mỗi tin: tiêu đề VI, tóm tắt VI, nguồn, giờ, link gốc, nhãn tác động |
| Lịch | public | Hiện khi topic có module lịch đang bật |
| Biểu đồ | public | Hiện khi topic có module số liệu đang bật (Recharts) |
| Vận hành | admin | Lịch sử chạy, quota AI của topic hôm nay, nút Xem thêm / Cập nhật tin mới |

| Trang Cấu hình | Nội dung |
|---|---|
| Danh sách topic | Tạo / sửa / **bật-tắt** topic, sắp xếp thứ tự, quota AI riêng |
| Chi tiết topic | Tab: Categories · Entities · Sources · Slots (kéo thả thứ tự) · Editions (giờ, múi giờ, ngày) · Data modules · Hướng dẫn chấm điểm · Giới hạn nút bấm. Mỗi dòng có công tắc bật/tắt |
| Hệ thống | AI providers, giới hạn toàn cục |

Netlify: build `apps/web`, `_redirects` cho SPA (`/* /index.html 200`).

---

## 12. Cấu trúc repo

```
news-coming/
├─ apps/
│  ├─ web/                 # Vite + React + HeroUI
│  └─ worker/              # entry: run --topic <id> --edition <id>
│     └─ connectors/       # source kinds + data module connectors
├─ supabase/
│  ├─ migrations/          # schema, RLS, pg_cron scheduler
│  ├─ seed/                # topic macro_finance: categories, entities, sources, slots, editions, modules
│  └─ functions/
│     ├─ _shared/          # core TS thuần (fetch-only): AI providers, prompt builder, scoring, slot selection
│     ├─ request-otp/
│     ├─ more-news/
│     └─ trigger-refresh/
├─ .github/workflows/
│  ├─ ci.yml               # kiểm tra cho PR và main
│  ├─ deploy.yml           # deploy khi main thay đổi
│  └─ run.yml              # worker: workflow_dispatch(topic, edition) + schedule dự phòng
├─ docs/DESIGN.md
└─ pnpm-workspace.yaml
```

Core logic viết TypeScript thuần trong `supabase/functions/_shared/` để dùng chung cho worker (Node 22) và Edge Functions (Deno).

---

## 13. CI/CD — tự động deploy khi `main` thay đổi

### 13.1 Thành phần và cách deploy

| Thành phần | Deploy bằng | Khi nào chạy (path filter) |
|---|---|---|
| DB (schema, RLS, pg_cron) | `supabase db push` | `supabase/migrations/**` |
| Edge Functions | `supabase functions deploy` | `supabase/functions/**` |
| Web | build trong GitHub Actions → `netlify deploy --prod --dir apps/web/dist` | `apps/web/**`, `supabase/functions/_shared/**` (type dùng chung), lockfile |
| Worker | **Không cần deploy**: `run.yml` checkout tag `prod`; deploy xong thì dời tag `prod` về commit vừa deploy | `apps/worker/**`, `supabase/functions/_shared/**` |

Chỉ phần nào thay đổi mới được deploy (dùng `dorny/paths-filter`). Commit chỉ sửa `docs/` không kích hoạt deploy.

### 13.2 Luồng

```
PR / push ──► ci.yml
               ├─ install (pnpm, cache)
               ├─ typecheck + lint + unit test (scoring, chọn slot, prompt builder, parser nguồn)
               ├─ build web
               ├─ deno check Edge Functions
               └─ supabase start (Postgres local trong runner)
                    → db reset (chạy toàn bộ migration + seed)
                    → supabase test db (pgTAP: test RLS, test bật/tắt topic)

push main ──► deploy.yml  (chỉ chạy khi ci.yml xanh; environment "production")
               1. Migrations      supabase db push --dry-run → supabase db push
               2. Edge Functions  supabase functions deploy (chỉ function thay đổi)
               3. Web             vite build → netlify deploy --prod
               4. Worker          git tag -f prod <sha> && git push -f origin prod
               ✔ mỗi bước chỉ chạy khi bước trước thành công
```

- **Thứ tự cố định DB → Functions → Web → Worker**: code mới không bao giờ chạy trên schema cũ.
- **Tag `prod`**: worker luôn chạy code đã deploy trọn vẹn. Nếu bước migration lỗi, worker vẫn chạy bản cũ ổn định thay vì code mới trên schema cũ.
- `concurrency: deploy` — không có 2 lần deploy chồng nhau; `run.yml` dùng chung group với bước dời tag để worker không bị đổi code giữa chừng.

### 13.3 Quy tắc migration

- Chỉ **forward**, không sửa migration đã merge; sửa lỗi bằng migration mới.
- Ưu tiên thay đổi **tương thích ngược** (thêm cột/bảng trước, xóa cột ở migration sau khi code không còn dùng).
- Seed cấu hình topic viết dạng `insert … on conflict do nothing` → deploy lại không ghi đè cấu hình bạn đã chỉnh trên web.

### 13.4 Rollback

| Thành phần | Cách rollback |
|---|---|
| Web | Netlify UI "Publish deploy" bản trước (tức thì, không build lại) |
| Edge Functions | Chạy `deploy.yml` thủ công (`workflow_dispatch`) với SHA cũ |
| Worker | Dời tag `prod` về SHA cũ (job thủ công trong `deploy.yml`) |
| DB | Migration sửa lỗi mới (forward-only) |

### 13.5 Chi phí / free tier

- GitHub Actions: repo public → không giới hạn phút. Supabase CLI deploy: miễn phí.
- **Netlify:** gói Free hiện tính theo credit, mỗi production deploy tốn credit (cần kiểm tra mức hiện tại trong tài khoản; tài khoản tạo trước 09/2025 có thể vẫn ở gói build-minutes cũ). Vì vậy:
  - **Tắt auto build của Netlify** (Stop builds), chỉ deploy từ GitHub Actions và **chỉ khi `apps/web` đổi**.
  - Tắt Deploy Previews / branch deploys.
  - Gom nhiều thay đổi web vào một lần merge; nếu sắp chạm giới hạn credit trong tháng, `deploy.yml` có biến `WEB_DEPLOY_ENABLED` để tạm dừng deploy web (backend vẫn deploy bình thường).
- Supabase Free cho 2 project → có thể dùng project thứ 2 làm staging sau này; giai đoạn đầu CI dùng Supabase local trong runner là đủ.

### 13.6 Bảo vệ nhánh `main` (miễn phí với repo public)

- Bắt buộc `ci.yml` xanh trước khi merge.
- Khuyến nghị làm việc qua PR (kể cả làm một mình) để CI chạy trước khi đụng production; nếu push thẳng `main`, `deploy.yml` vẫn chờ CI xanh mới deploy.
- Secret deploy đặt trong GitHub **Environment `production`** → chỉ job deploy đọc được, workflow của PR từ fork không thấy.

### 13.7 Secret cần cho deploy

| Biến | Nơi đặt |
|---|---|
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` | Environment `production` |
| `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID` | Environment `production` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | GitHub Variables (public, dùng lúc build web) |

Secret runtime của Edge Functions (`ADMIN_EMAIL`, API key AI…) đặt một lần bằng `supabase secrets set`, không đi qua pipeline deploy.

---

## 14. Secrets / biến môi trường

| Biến | Nơi đặt |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | GitHub Secrets |
| `GROQ_API_KEY`, `GEMINI_API_KEY`, `CEREBRAS_API_KEY`, `CF_ACCOUNT_ID`, `CF_API_TOKEN` | GitHub Secrets + Supabase Secrets (cho `more-news`) |
| `FRED_API_KEY`, `EIA_API_KEY`, `SEC_USER_AGENT` | GitHub Secrets |
| `ADMIN_USERNAME`, `ADMIN_EMAIL` | Supabase Secrets |
| `GITHUB_DISPATCH_TOKEN` (fine-grained, chỉ quyền Actions của repo này) | Supabase Vault (pg_net) + Supabase Secrets (`trigger-refresh`) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Netlify env (public, an toàn nhờ RLS) |

---

## 15. Lộ trình

| Phase | Nội dung | Xong khi |
|---|---|---|
| 1 | Monorepo, Supabase project, migrations + RLS; seed topic Vĩ mô / Tài chính; script verify nguồn §7; `ci.yml` + `deploy.yml` (§13), branch protection | Script in ra nguồn nào OK / lỗi; merge vào `main` tự deploy migration |
| 2 | Worker: fetch + dedupe + cluster + lọc từ khóa theo topic (chưa AI) | Chạy local, `articles` có dữ liệu sạch |
| 3 | AI layer: provider + fallback + quota (provider + topic); prompt builder; chấm điểm, chọn slot, tóm tắt, dịch | Tạo được digest Sáng hoàn chỉnh từ local |
| 4 | Data modules; scheduler pg_cron → workflow_dispatch + schedule dự phòng | Chạy tự động 3 ngày liên tục không lỗi |
| 5 | Web public: chọn topic, Bản tin, Lịch, Biểu đồ; nối bước deploy web vào `deploy.yml` | Merge vào `main` → web mới lên Netlify |
| 6 | Auth OTP (Resend) + Cấu hình (bật/tắt mọi cấp) + Vận hành + Xem thêm / Cập nhật | Tắt topic → lần chạy kế không fetch, web ẩn; quota được enforce |
| 7 | Tinh chỉnh prompt / điểm sàn theo dữ liệu 1–2 tuần | Bản tin đúng trọng tâm |

---

## 16. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Provider AI cắt quota free | Fallback chain + cấu hình trong DB + cap theo topic |
| Thêm nhiều topic làm cạn quota chung | `ai_daily_request_cap` mỗi topic; trang Hệ thống hiển thị tổng cap so với limit provider |
| Nguồn đổi định dạng / chặn | `sources.last_error`, cảnh báo trên trang Vận hành; Google News làm lưới an toàn |
| Giá dầu từ nguồn không chính thức hỏng | Fallback EIA (trễ 1 ngày) |
| pg_cron / GitHub dispatch lỗi | Schedule GitHub dự phòng 1 lần/ngày chạy bù edition bị lỡ |
| Supabase pause / chạm 500MB | Job ghi hằng ngày; cleanup theo `retention` của từng topic |
| AI chấm điểm sai | `ai_reason` hiển thị cho admin; điểm cuối có thành phần tất định |
| Bot đốt quota qua nút bấm | Nút chỉ cho admin + giới hạn lượt/ngày theo topic |
| Deploy lỗi giữa chừng / migration hỏng | Thứ tự DB → Functions → Web → Worker; worker chạy theo tag `prod`; CI chạy migration trên Postgres local trước |
| Hết credit Netlify do deploy nhiều | Tắt auto build + deploy preview; chỉ deploy web khi `apps/web` đổi; công tắc `WEB_DEPLOY_ENABLED` |
