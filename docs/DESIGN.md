# news-coming — Thiết kế hệ thống

Hệ thống bản tin theo **topic**: mỗi topic tự động lấy tin từ nguồn đã cấu hình, chấm điểm, tóm tắt, dịch sang tiếng Việt và hiển thị trên web. Topic đầu tiên: **Vĩ mô / Tài chính**.

> **Định hướng sản phẩm (2026-10-17):** dự án chỉ xoay quanh **một chủ đề tài chính – địa chính trị** (`macro_finance`). Schema vẫn giữ topic là cấp cao nhất, nhưng giao diện không còn quản lý chủ đề và tổ chức theo dõi; slot chỉ chọn tin theo danh mục. Hướng dẫn sử dụng: `README.md`.

> **Rule cứng:** 100% free tier. Mọi quyết định thiết kế ưu tiên (1) không phát sinh chi phí, (2) tiêu thụ token tối thiểu, (3) hết quota thì chậm lại chứ không gián đoạn.

---

## 1. Quyết định đã chốt

| # | Hạng mục | Quyết định |
|---|---|---|
| 1 | Tổ chức dữ liệu | **Topic là cấp cao nhất.** Mọi thứ (danh mục, tổ chức, nguồn, slot, lịch chạy, số liệu, lịch sự kiện, bản tin, quota) thuộc về 1 topic. Mỗi cấp đều bật/tắt được |
| 2 | DB / Auth | Supabase Free (Postgres + RLS + Auth + Edge Functions + Realtime + pg_cron) |
| 3 | Web | Vite + React SPA + HeroUI v3 + Tailwind v4, deploy Netlify (chỉ static, không SSR) |
| 4 | Worker | Node.js 24/TypeScript (chạy `.ts` trực tiếp, không cần build) trên GitHub Actions (repo **public** → không giới hạn phút) |
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
| Data modules | `oil_price` (WTI/Brent) · `gold_price` (vàng COMEX) · `us_yields` (2Y/10Y/30Y) · `jp_yields` (JGB 10Y/30Y) · `macro_calendar` (FOMC, CPI, NFP, PCE, đấu giá TPCP, BOJ) |
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

Migration `20261016000100_scheduler.sql`.

- `editions` lưu `timezone`, `local_time`, `weekdays` → tự xử lý giờ mùa hè/đông (08:45 ET = 19:45 VN mùa hè, 20:45 VN mùa đông).
- `public.due_editions(now)`: edition đang bật của topic đang bật, đúng thứ trong tuần, trong vòng 6h sau giờ chạy, và hôm nay (theo múi giờ của edition) chưa có `crawl_runs` thành công/partial (hoặc đang chạy trong 1h gần nhất).
- `public.dispatch_due_editions()`: chạy bởi **pg_cron mỗi 5 phút**; với mỗi edition đến hạn gọi GitHub API `workflow_dispatch` của `run.yml` (`command=edition`, `trigger=schedule`) qua **pg_net**. Tối đa 1 lần/30 phút và 3 lần/ngày mỗi edition (lần sau = thử lại khi lần trước lỗi). Ghi vào `schedule_dispatches`. Repo/workflow/ref lấy từ `app_settings.github_dispatch`.
- Token GitHub **không nằm trong code/migration**: lưu một lần trong Supabase Vault tên `github_dispatch_token`. Chưa có token → hàm không làm gì.
- Dự phòng: `run.yml` có `schedule` lúc 00:30 UTC (07:30 VN) và 14:15 UTC T2–T6 (sau 08:45 New York) chạy lệnh `catch-up` → chạy các edition đến hạn mà hôm nay chưa chạy (`trigger=backup`).
- Dispatch từ pg_cron không bị GitHub tắt sau 60 ngày repo không hoạt động; job hằng ngày giữ Supabase không bị pause.
- `concurrency` group theo topic để 2 lần chạy cùng topic không chồng nhau.

**Cài đặt một lần (admin):**
1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained** → chỉ repo `news-coming` → Repository permissions → **Actions: Read and write** → Generate (tài khoản phải có quyền ghi repo).
2. Supabase → SQL Editor: `select vault.create_secret('<token>', 'github_dispatch_token', 'GitHub token for scheduled editions');`
3. Kiểm tra: `select jobname, schedule from cron.job;` — sau giờ chạy: `select * from schedule_dispatches order by dispatched_at desc;` và `select status_code, content from net._http_response order by created desc limit 5;` (mong đợi 204).
4. Token hết hạn → tạo token mới, `select vault.update_secret((select id from vault.secrets where name = 'github_dispatch_token'), '<token mới>');`

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
- Trạng thái: `raw → filtered_out | duplicate | scored → selected → summarized → translated` (+ `failed`). `duplicate` = cùng câu chuyện đã có từ nguồn khác; chỉ giữ để không tải lại URL và để tăng `source_count` của bài đại diện.

### 4.0 Bước thu thập (Phase 2, đã chạy thật)

Code: `apps/worker/src/pipeline/collect.ts`. Chạy: `pnpm collect` (cần `.env`) hoặc `pnpm dry-run` (không cần DB: nạp cấu hình từ migration vào PGlite, lấy tin thật, giữ trong bộ nhớ).

- Lọc từ khóa: khớp nguyên từ (cho phép đuôi số nhiều `s`/`es`), từ khóa kết thúc bằng `*` khớp tiền tố. `topics.settings.exclude_keywords` loại tin rác cho cả topic (trang giá, "price today"…). Nguồn chính thức (authority ≥ 10) luôn qua lọc.
- Gom cụm: Jaccard trên từ khóa tiêu đề ≥ 0.5, so với cả tin trong 48h trước. Hai tin cùng nguồn và cùng publisher không bao giờ gộp (ví dụ hai hồ sơ 8-K khác nhau).
- `articles.authority`: tin từ Google News / GDELT lấy theo domain của báo gốc (cơ quan nhà nước +10, Reuters/Bloomberg/WSJ/FT/AP/Nikkei +5).
- Bỏ tin cũ hơn 36h; tối đa 50 tin mỗi nguồn.
- Dry run ngày 2026-10-14: 801 tin → 237 quá cũ, 122 bị lọc, 28 trùng, **405 tin mới chờ chấm điểm**; chạy lại lần 2: 0 tin mới.
- **Hệ quả cho Phase 3:** ~400 tin/lần chạy đầu tiên (các lần sau ít hơn vì chỉ có tin mới) — Phase 3 cần xếp hạng sơ bộ bằng code (authority, `source_count`, độ mới, giới hạn theo category) và chỉ gửi top ~150 tiêu đề cho AI để giữ ≤ 6 request chấm điểm/lần.

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
| `category` | Lấy tin điểm cao nhất thuộc `category_ids`, tối đa `max_items`; từ tin thứ 2 trở đi phải đạt `extra_item_min_score` (nếu có) |
| `per_category` | Mỗi category trong `category_ids` lấy 1 tin; category không có tin đạt sàn thì bỏ trống |
| `per_entity` | Mỗi entity trong `entity_ids` lấy 1 tin; entity không có tin đạt sàn thì bỏ trống |
| `fill` | Lấp đến kích thước edition theo `final_score` giảm dần |

Slot có `attach_module` → hiển thị card số liệu của module đó và ưu tiên tin có `explains = attach_module`.

Seed cho Vĩ mô / Tài chính:

| Pos | Slot | kind | category / entity | Số tin | Sàn | attach_module |
|---|---|---|---|---|---|---|
| 1 | Giá dầu | category | oil | 1 (tin giải thích nguyên nhân) | 40 | oil_price |
| 2 | FED | category | fed | 1–2 (tin 2 nếu ≥ 70) | 40 | — |
| 3 | Lợi suất Mỹ + Nhật | category | yield_us, yield_jp | 1 | 40 | us_yields, jp_yields |
| 4 | Địa chính trị + Vàng | per_category | geo, gold | 1–2 | 45 | — |
| 5 | Còn lại | fill | tất cả | phần còn lại | 50 | — |

Edition `pre_us` chỉ xét tin sau `window_end` của edition trước cùng ngày, loại tin đã xuất hiện, và kèm sự kiện trong phiên Mỹ hôm đó.

Slot "Tổ chức" (per_entity) đã bỏ ngày 2026-10-17 (migration `20261017000200_drop_entity_slot.sql`): dự án chỉ theo 1 chủ đề tài chính – địa chính trị, slot chỉ chọn theo danh mục.

Thứ tự hiển thị: tin ghim → theo `position`, tất cả trong một lưới so le (không chia nhóm theo slot).

---

## 6. "Xem thêm" và "Cập nhật tin mới" (đã làm, Phase 6)

| Nút | Cơ chế | Chi phí | Thời gian |
|---|---|---|---|
| Xem thêm (cuối trang bản tin, chỉ admin) | Edge Function `more-news(digestId)` → `addMoreToDigest` (`_shared/pipeline/more.ts`): tin `scored` trong khung giờ của digest, điểm cao nhất, khác `story_key` đã có, **đọc được** (thay vì ghép bài khác) → tóm tắt + dịch + kiểm tra trung thực → `digest_items.added_by = 'more'`. Mặc định 4 tin/lần (`settings.more_batch_size`) để vừa giới hạn 150s của Edge Function với 8K token/phút của Groq | ~2 request tóm tắt + 2 dịch | 1–2 phút |
| AI gợi ý (popup sửa danh mục, trang Cấu hình) | Edge Function `category-assist(topicId, categoryId, brief)` (`_shared/category-assist.ts`): từ mô tả admin nhập (≤ 600 ký tự, tiếng Việt được) → gợi ý từ khóa nhận diện, từ khóa ngoại lệ (tiếng Anh, chữ thường) và mô tả cho AI. **Không lưu gì**: admin chọn gợi ý trong popup rồi bấm OK mới lưu. Lượt/ngày `settings.daily_cap_assist` (10), quota action `assist` | 1 request extract (Groq) | vài giây |
| Cập nhật tin mới (trang Vận hành) | Edge Function `trigger-refresh(topicId, editionId)` → GitHub `workflow_dispatch` `run.yml` với `refresh=true` → worker `edition --refresh`: thu thập + chấm điểm tin mới từ cuối khung giờ cũ, thêm tối đa `settings.refresh_size` (6) tin đọc được vào bản tin hôm nay (`added_by = 'refresh'`), dời `window_end` | ~7–9 request | 5–15 phút |

- Giới hạn lượt/ngày theo topic (`settings.daily_cap_more`, `daily_cap_refresh`, `daily_cap_assist`), trừ atomic bằng `use_action_quota()` (chỉ service_role).
- Hết quota AI giữa chừng → tin đã chọn giữ trạng thái `selected`/`summarized`, lần chạy kế tiếp làm nốt.
- Code lõi pipeline (AI steps, đọc bài, store, more) nằm ở `supabase/functions/_shared/pipeline/`, dùng chung cho worker (Node) và Edge Functions (Deno; import map ở `supabase/functions/*/deno.json`). CI có job `deno check` cho mọi function.

---|---|---|---|
| Xem thêm | Edge Function `more-news(digest_id)`: lấy 5–8 tin `scored` tiếp theo của digest đó → tóm tắt + dịch → thêm `digest_items` (`added_by = 'more'`) | ~2 req | 10–20 s |
| Cập nhật tin mới | Edge Function `trigger-refresh(topic_id)` → `workflow_dispatch` → pipeline cho cửa sổ từ lần chạy trước; web theo dõi qua Realtime | ~7–9 req | 2–3 phút |

- Chỉ admin thấy nút; topic tắt thì nút bị khóa.
- Giới hạn lượt/ngày theo topic trong `topics.settings` (mặc định Xem thêm 5, Cập nhật 3), đếm trong `action_quota`.
- Kết quả lưu DB → người xem public thấy luôn.
- Edge Function giới hạn 150s (free) → mỗi lần "Xem thêm" ≤ 8 tin.

---

## 7. Nguồn dữ liệu — topic Vĩ mô / Tài chính

> Đã verify ngày 2026-10-14 bằng `apps/worker/scripts/verify-sources.ts` (`pnpm verify:sources`). Cấu hình thật nằm trong migration seed.

### 7.1 Tin tức (`sources`)

Đã loại sau khi kiểm tra: blog Coinbase (403), blog Circle (không có RSS), Stooq (404) → thay bằng Google News + EDGAR + Yahoo. EDGAR bắt buộc `SEC_USER_AGENT` có email liên hệ (thiếu → 403). CIK đã xác nhận: Strategy `0001050446`, BitMine `0001829311`, Coinbase `0001679788`, Circle `0001876042`, BlackRock `0002012383`.

| Category / Entity | Nguồn | Endpoint | Authority |
|---|---|---|---|
| fed | Fed press (all / monetary) | `https://www.federalreserve.gov/feeds/press_all.xml`, `.../feeds/press_monetary.xml` | +10 |
| fed | Fed speeches | `https://www.federalreserve.gov/feeds/speeches.xml` | +10 |
| treasury | Treasury press releases | `home.treasury.gov/news/press-releases` (RSS/HTML — verify) | +10 |
| yield_jp | BOJ / MOF Japan | trang thông báo BOJ, MOF (verify RSS) | +10 |
| entities | SEC EDGAR | `https://data.sec.gov/submissions/CIK##########.json` (8-K, 10-Q, 13F, S-1). Header bắt buộc `User-Agent: news-coming <email>` | +10 |
| crypto | Binance announcements (JSON không chính thức) | `binance.com/bapi/composite/v1/public/cms/article/list/query` | +5 |
| mọi category | Google News RSS theo query | `https://news.google.com/rss/search?q=<query>+when:1d&hl=en-US&gl=US&ceid=US:en` | theo domain gốc |
| crypto, tokenization | CoinDesk, The Block | `https://www.coindesk.com/arc/outboundfeeds/rss/`, `https://www.theblock.co/rss.xml` | 0 |
| geo | GDELT DOC API (**tắt sẵn**: giới hạn 1 request/5s/IP, hay trả 429) | `https://api.gdeltproject.org/api/v2/doc/doc?query=…&mode=artlist&format=json` | 0 |

Query Google News khởi điểm (mỗi query là 1 source):
- oil: `oil prices OR brent OR WTI OR OPEC`
- fed: `"Federal Reserve" OR FOMC OR Powell`
- yield_us: `"Treasury yields" OR "10-year yield"` · yield_jp: `"JGB yields" OR "Bank of Japan"`
- entities: `"Strategy" MSTR bitcoin` · `BitMine BMNR` · `Coinbase` · `"Circle" USDC` · `BlackRock (bitcoin OR ETF OR tokenized)`
- geo: `war OR sanctions OR geopolitical tensions markets`
- gold: `gold prices OR "central bank gold"`
- tokenization: `tokenization OR "tokenized treasuries" OR RWA`

### 7.2 Data modules

Code: `apps/worker/src/modules/`. Yahoo lấy 10 ngày gần nhất mỗi lần; module chưa có dòng `market_data` nào thì lấy 1 năm một lần để biểu đồ có dữ liệu ngay. Chạy trước bước thu thập tin khi `editions.run_modules = true`, hoặc riêng bằng lệnh `modules`. Module lỗi không làm hỏng bản tin: lỗi ghi vào `crawl_runs.stats.modules`, dữ liệu cũ giữ nguyên.


| Module | Loại | Nguồn | Ghi chú |
|---|---|---|---|
| `us_yields` | số liệu | Treasury Daily Yield Curve XML; dự phòng FRED (`DGS2`, `DGS10`, `DGS30`) nếu có `FRED_API_KEY` | FRED key free |
| `jp_yields` | số liệu | MOF Japan `jgbcme.csv` | trễ 1 ngày làm việc |
| `oil_price` | số liệu | Yahoo chart `CL=F`, `BZ=F` (gần realtime, **không chính thức**) → dự phòng EIA API v2 (`RWTC`, `RBRTE`) nếu có `EIA_API_KEY` | EIA key free, trễ ~1 ngày |
| `gold_price` | số liệu | Yahoo chart `GC=F` (vàng COMEX kỳ hạn gần nhất, USD/ounce, **không chính thức**); không có nguồn dự phòng miễn phí | Thêm 2026-10-18 |
| `macro_calendar` | lịch | FOMC (HTML `fomccalendars.htm`, 14:00 ET ngày cuối), BOJ (bảng lịch họp, ~12:00 Tokyo ngày cuối), đấu giá TPCP Mỹ 2–30 năm (FiscalData `upcoming_auctions`), CPI/NFP/PCE/PPI/GDP/JOLTS qua **FRED release calendar** (bls.gov chặn truy cập tự động; cần `FRED_API_KEY`) | Tên tiếng Việt từ bảng cố định trong code, không dùng AI. Lưu sự kiện từ 3 ngày trước tới 45 ngày tới |

---

## 8. AI providers (dùng chung mọi topic)

Hạn mức free đọc từ Groq console và Google AI Studio ngày 2026-10-15, seed trong `supabase/migrations/20261015000200_ai.sql` (bảng `ai_providers`, sửa được không cần deploy). Model Llama không còn trong gói free của tài khoản này.

| Role | Priority | Provider / model | RPM | TPM | RPD | Tokens/ngày |
|---|---|---|---|---|---|---|
| extract | 1 | Groq `openai/gpt-oss-120b` (`reasoning_effort: low`) | 30 | **8K** | 1K | 200K |
| extract | 2 | Groq `qwen/qwen3.8-27b` | 30 | 8K | 1K | 200K |
| extract | 3 | Groq `openai/gpt-oss-20b` | 30 | 8K | 1K | 200K |
| extract | 4 | Gemini API `gemma-4-31b-it` | 30 | 16K | 14.4K | — |
| translate | 1 | Gemini `gemini-3.5-flash-lite` | 15 | 250K | 500 | — |
| translate | 2 | Gemini `gemini-3.1-flash-lite` | 15 | 250K | 500 | — |
| translate | 3 | Gemini API `gemma-4-31b-it` | 30 | 16K | 14.4K | — |
| translate | 4 | Groq `openai/gpt-oss-120b` | 30 | 8K | 1K | 200K |

- Tên model theo hiển thị trong console; kiểm tra id thật bằng lệnh `verify-ai` (Actions → Run worker → `verify-ai`). Sai id → sửa cột `model` trong bảng `ai_providers`.
- Các model Gemini "Flash" thường (không Lite) chỉ có 20 request/ngày → không dùng.
- Router (`supabase/functions/_shared/ai/router.ts`): chọn provider theo priority; bỏ qua provider đã dùng ≥ 80% request hoặc token/ngày; chờ cửa sổ RPM/TPM tối đa 70s; 429 → bỏ provider đó cho cả lần chạy; lỗi khác hoặc JSON hỏng → thử provider kế. Hết provider → `AiUnavailableError`, pipeline dừng và để phần còn lại cho lần chạy sau.
- `ai_usage` ghi qua hàm `record_ai_usage` (atomic, chỉ service_role). Cap theo topic: `topics.ai_daily_request_cap`.
- **TPM 8K của Groq là giới hạn chặt nhất:** chấm điểm 25 tiêu đề/request (~4–5K token) → ~1 request/phút; một bản tin sáng mất khoảng 6–10 phút chạy trên Actions (miễn phí, repo public).

### 8.1 Pipeline một bản tin (`node src/index.ts edition --edition morning`)

1. Thu thập (§4.0).
2. Cửa sổ: từ `window_end` của digest gần nhất (hoặc 24h trước) tới hiện tại.
3. Xếp hạng sơ bộ bằng code → tối đa 150 tin, ≤ 30 tin/category → chấm điểm theo lô 25 → `scored` + `final_score`.
4. Chọn tin theo slot (`supabase/functions/_shared/selection.ts`): **mỗi sự kiện chỉ 1 tin** — AI trả `story` (slug sự kiện, ví dụ `us-cpi-sep-2026`) khi chấm điểm, lưu ở `articles.story_key`; tin cùng `story_key` với tin đã chọn bị bỏ qua. Mỗi edition chỉ tạo digest 1 lần/ngày; chạy lại chỉ làm nốt việc dang dở.
5. **Đọc bài — 2 lớp miễn phí:** (a) tải thẳng trang báo + Readability (linkedom); (b) không được thì Jina Reader (`r.jina.ai`, ẩn danh ~20 request/phút, đã được duyệt 2026-10-15; Jina có thể tạm chặn cả một domain với người dùng ẩn danh — ví dụ CNBC ngày 2026-10-16 — nên không dùng làm lớp chính; key free của Jina là token cấp 1 lần nên không dùng). Link Google News được giải mã ra link gốc trước; các báo paywall (Reuters, WSJ, Bloomberg, FT, MarketWatch…) bỏ qua luôn. Nguồn RSS đọc được, uy tín (CNBC Economy/Markets, OilPrice, Decrypt, CoinDesk, The Block, Cointelegraph) và domain tương tự qua Google News được +3 authority để xếp trên blog/site kém tin cậy. **Tiêu đề và nội dung luôn của cùng một bài**: tin không đọc được thì được thay *nguyên bài* bằng bài của báo khác trong cùng cụm (lấy tiêu đề, link, nguồn của bài đó; giữ điểm của tin gốc), không có bài thay thì bỏ tin đó và slot lấy ứng viên kế tiếp (tối đa 5 vòng chọn lại). Lưu `content_snippet`, `original_url`.
6. **Trung thực là rule cứng** (`.agents/rules/content-integrity.md`): prompt cấm dùng kiến thức ngoài, suy đoán, bịa số/trích dẫn; tác động/triển vọng chỉ nêu khi bài gốc nói. Prompt tóm tắt bỏ qua phần rác của trang (bảng giá, widget, bài liên quan, quảng cáo, miễn trừ). Kiểm tra bằng code (`_shared/faithfulness.ts`, 0 token), so **nguyên con số** sau khi bỏ dấu phân cách (`4,105.63` = `4.105,63` = `410563`): mọi con số trong tóm tắt phải có trong bài gốc, mọi con số trong bản dịch phải có trong tóm tắt tiếng Anh. Sai → làm lại 1 lần; vẫn sai → `failed`, không đăng (đếm trong `stats.rejected`).
   Tóm tắt tiếng Anh dài ~`topics.settings.summary_words` từ (mặc định 350 ≈ 3 phút đọc sau khi dịch), 3–5 đoạn, theo lô 2 bài → `summarized`. Bài gốc ngắn thì tóm tắt ngắn theo, không thêm chi tiết.
7. Dịch theo lô 3 → `translated` (lúc này web public mới thấy). Bản dịch có từ Latin ≥ 7 ký tự không có trong bản gốc (dấu hiệu dính chữ, ví dụ "trongani") được dịch lại riêng 1 lần; tương tự với từ tiếng Anh viết thường còn sót nguyên trong bản dịch ("giá oil"). Tiêu đề tiếng Việt viết hoa kiểu câu.

Danh mục có thêm `categories.description_en` (gợi ý tiếng Anh cho AI, ví dụ `treasury` = hoạt động của Bộ Tài chính Mỹ, *không phải* lợi suất). Tên nguồn dạng "Tiêu đề trang | OilPrice.com" được rút gọn còn "OilPrice.com".

Ước tính một bản tin sáng: ~6 request chấm điểm + ~6 request tóm tắt (Groq, giới hạn 8K token/phút → ~12–15 phút chạy) + ~4 request dịch (Gemini); ~100K token Groq/ngày cho 2 edition, dưới mức 80% của 200K.

---

## 9. Schema DB

Schema thật nằm trong migration, không lặp lại ở đây để tránh lệch:

| File | Nội dung |
|---|---|
| `supabase/migrations/20261014000100_schema.sql` | Enum, bảng cấu hình (topics, categories, entities, sources, data_modules, editions, digest_slots), dữ liệu (articles, digests, digest_items, market_data, events), vận hành (crawl_runs, ai_providers, ai_usage, action_quota, app_settings, login_attempts) |
| `supabase/migrations/20261014000200_security.sql` | `is_admin()`, `is_topic_public()`, grants theo cột, RLS |
| `supabase/migrations/20261014000300_seed_macro_finance.sql` | Cấu hình topic Vĩ mô / Tài chính |
| `supabase/tests/database/rls.test.sql` | Test pgTAP cho quyền truy cập |

Khác so với bản draft ban đầu: thêm slot kind `per_category`, cột `digest_slots.extra_item_min_score`, `articles.source_name` (để public hiển thị tên nguồn mà không cần đọc bảng `sources`), enum `impact_direction`, và khóa ngoại phức hợp tới categories/entities (`on delete set null` theo cột). `ai_providers` chưa seed — model và hạn mức sẽ được kiểm tra thực tế ở Phase 3.

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

### 10.2 Đăng nhập (đã làm, Phase 6)

Edge Function `admin-login` làm **cả hai bước** trên server, nên email admin không bao giờ xuống trình duyệt:
1. `{action: "request", username}`: giới hạn 5 lần/giờ/IP (IP được băm bằng `LOGIN_HASH_SALT`, ghi `login_attempts`); so username với `ADMIN_USERNAME` (so sánh thời gian hằng); đúng thì `signInWithOtp(ADMIN_EMAIL, shouldCreateUser: false)`. Luôn trả cùng một câu → không dò được username.
2. `{action: "verify", code}`: giới hạn 10 lần/giờ/IP; `verifyOtp(ADMIN_EMAIL, code)` → trả `access_token`/`refresh_token`, web gọi `setSession`.
3. Phiên 15 ngày: kiểm ở DB (`is_admin()`), ở Edge Functions (`last_sign_in_at`) và ở web (tự đăng xuất).

Cấu hình Supabase Auth:
- Tắt **Allow new users to sign up**; tạo sẵn 1 user `ADMIN_EMAIL` (Auto Confirm).
- OTP 6 số, hết hạn 600s; mẫu **Magic Link** dùng `{{ .Token }}`.
- Custom SMTP = **Resend không cần domain**: host `smtp.resend.com`, port `465`, user `resend`, password = API key, sender **`onboarding@resend.dev`**. Với domain mặc định này Resend **chỉ gửi tới email đã đăng ký tài khoản Resend** → `ADMIN_EMAIL` phải đúng là email đó (quyết định của user ngày 2026-10-17). Free 100 email/ngày.
- Secrets của Edge Functions: `ADMIN_USERNAME`, `ADMIN_EMAIL`, `LOGIN_HASH_SALT`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `GITHUB_DISPATCH_TOKEN` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` có sẵn).
- `supabase/config.toml`: `verify_jwt = false` cho 3 function (chúng tự kiểm tra; khóa publishable mới không phải JWT).

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


### 11.1 Đã làm (Phase 5 — public)

Code: `apps/web` (Vite 8 + React 19 + HeroUI v3 + Tailwind v4 + TanStack Query + react-router 8 + Recharts). Chỉ đọc qua anon key, cột theo grant (`original_url` được mở thêm ở `20261016000300_public_web.sql`).

| Route | Nội dung |
|---|---|
| `/t/:topicId` | Bản tin: dải số liệu (dầu, lợi suất Mỹ/Nhật, thay đổi so phiên trước), chọn ngày (‹ ›) và edition (tabs), sự kiện quan trọng sắp tới, mọi tin trong một lưới so le (1–3 cột, tin ghim trước rồi theo `position`). Card: Tin nóng, danh mục, mức tác động, chiều tác động, tiêu đề, nguồn/giờ/phút đọc, đoạn đầu; "Xem thêm" mở popup đọc đầy đủ; "Đọc bài gốc". URL giữ trạng thái `?date=&edition=` |
| `/t/:topicId/lich` | Lịch sự kiện theo ngày giờ VN, lọc "Rất quan trọng"/"Tất cả", ghi nguồn (FRED…) |
| `/t/:topicId/bieu-do` | Biểu đồ lợi suất Mỹ, Nhật, giá dầu (1/3/12 tháng), tải lười để không làm nặng trang chính |

- Font tự host (Be Vietnam Pro + Noto Serif, có tiếng Việt) → CSP không cần domain ngoài. `public/_headers`: CSP (`connect-src https://*.supabase.co`; `style-src 'unsafe-inline'` vì HeroUI/Recharts dùng inline style), HSTS, `X-Frame-Options: DENY`… `public/_redirects` cho SPA.
- Nền sáng/tối theo hệ thống, nút chuyển lưu ở `localStorage` (chỉ là tiện ích, lỗi storage không ảnh hưởng).
- Nội dung luôn render dạng text (không `dangerouslySetInnerHTML`), link chỉ nhận http(s).
- Bundle: JS chính ~241KB gzip, trang biểu đồ tách riêng ~105KB gzip.
- Deploy: bước 3 của `deploy.yml` (build với GitHub Variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` → `netlify deploy --prod`).

### 11.2 Đã làm (Phase 6 — admin)

| Route | Nội dung |
|---|---|
| `/dang-nhap` | Username → mã 6 số (InputOTP) |
| `/quan-tri?topic=` | Vận hành: nút Cập nhật tin mới theo edition, lượng dùng AI hôm nay so hạn mức, lượt bấm đã dùng, lần pg_cron gọi GitHub, bảng Model AI (bật/tắt, ưu tiên, hạn mức), 15 lần chạy gần nhất (chấm/chọn/dịch/bỏ/loại, lỗi), nguồn đang lỗi |
| `/quan-tri/cau-hinh?topic=` | Cài đặt chung (hạn mức AI, độ dài tóm tắt, giới hạn nút, từ khóa bỏ hẳn tin dạng chip); Bản tin (card: tên cố định, múi giờ dạng `UTC+7 · Giờ Việt Nam`, chọn giờ, chọn thứ, số tin); Thứ tự ưu tiên (danh sách chỉ đọc, kéo thả sắp xếp, thêm/sửa trong popup, chỉ theo danh mục, tooltip giải thích điểm); Danh mục (tên + mã chỉ đọc, từ khóa nhận diện / ngoại lệ dạng chip, mô tả cho AI sửa qua nút bút chì); Nguồn tin; Số liệu & lịch. Mọi mục (kể cả Cài đặt chung, card Bản tin, Danh mục) hiển thị chỉ đọc, chỉ công tắc bật/tắt bấm tại chỗ; nút bút chì / Thêm mở popup có Hủy / OK, chỉ lưu khi bấm OK; mọi chỗ chọn danh mục là dropdown từ danh sách danh mục. Không còn bảng Chủ đề và Tổ chức. Model AI nằm ở trang Vận hành |

Admin đăng nhập thấy thêm link "Quản trị" ở header và nút "Xem thêm tin" cuối mỗi bản tin. Mọi thao tác ghi đều chạy với quyền admin nên RLS vẫn chặn khi phiên quá 15 ngày.

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
│     ├─ category-assist/
│     └─ trigger-refresh/
├─ .github/workflows/
│  ├─ ci.yml               # kiểm tra cho PR và main
│  ├─ deploy.yml           # deploy khi main thay đổi
│  └─ run.yml              # worker: workflow_dispatch(topic, edition) + schedule dự phòng
├─ docs/DESIGN.md
└─ pnpm-workspace.yaml
```

Core logic viết TypeScript thuần trong `supabase/functions/_shared/` để dùng chung cho worker (Node 24) và Edge Functions (Deno).

---

## 13. CI/CD — tự động deploy khi `main` thay đổi

### 13.1 Thành phần và cách deploy

| Thành phần | Deploy bằng | Khi nào chạy (path filter) |
|---|---|---|
| DB (schema, RLS, pg_cron) | `supabase db push` | `supabase/migrations/**` |
| Edge Functions | `supabase functions deploy` | `supabase/functions/**` |
| Web | build trong GitHub Actions → `netlify deploy --prod --dir apps/web/dist` | `apps/web/**`, `supabase/functions/_shared/**` (type dùng chung), lockfile |
| Worker | **Không cần deploy**: `run.yml` checkout tag `prod`; tag chỉ được dời khi DB và Functions đã ở cùng commit | `apps/worker/**`, `supabase/functions/_shared/**` |

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
               4. Worker          dời tag prod (chỉ khi DB + Functions không còn pending)
               ✔ mỗi bước chỉ chạy khi bước trước thành công
```

- **Thứ tự cố định DB → Functions → Web → Worker**: code mới không bao giờ chạy trên schema cũ.
- **Tag theo từng phần** `deployed/db`, `deployed/functions`, `deployed/web`: mỗi phần so thay đổi với tag của chính nó. Phần bị bỏ qua (chưa cấu hình secret, web đang tạm dừng) giữ tag cũ nên lần chạy sau tự deploy bù.
- **Tag `prod`**: worker luôn chạy code đã deploy trọn vẹn. Nếu migration lỗi hoặc còn pending, `prod` đứng yên → worker vẫn chạy bản cũ ổn định thay vì code mới trên schema cũ.
- `deploy.yml` chạy qua `workflow_run` sau khi CI xanh trên `main`, hoặc chạy tay (`workflow_dispatch`) với SHA bất kỳ để rollback.
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
