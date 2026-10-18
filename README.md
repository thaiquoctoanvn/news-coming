# news-coming

Bản tin **tài chính – địa chính trị** tiếng Việt, tự động mỗi ngày: lấy tin từ các nguồn đã cấu hình, chấm điểm, chọn 10–12 tin quan trọng nhất, tóm tắt và dịch sang tiếng Việt, kèm số liệu thị trường (dầu, vàng, lợi suất Mỹ/Nhật) và lịch sự kiện vĩ mô.

- **Web:** https://newscoming-edenx.netlify.app
- **Chi phí:** 0 đồng — chạy hoàn toàn trên gói miễn phí của Supabase, Netlify, GitHub Actions, Groq và Gemini. Hết hạn mức thì hệ thống chạy chậm lại, không hỏng.
- **Thiết kế chi tiết:** [docs/DESIGN.md](docs/DESIGN.md) · **Quy tắc cho AI agent:** [AGENTS.md](AGENTS.md)

---

## Mục lục

1. [Dành cho người đọc](#1-dành-cho-người-đọc)
2. [Dành cho quản trị](#2-dành-cho-quản-trị)
3. [Lịch chạy và hạn mức](#3-lịch-chạy-và-hạn-mức)
4. [Phát triển](#4-phát-triển)
5. [Deploy](#5-deploy)
6. [Cấu trúc dự án](#6-cấu-trúc-dự-án)

---

## 1. Dành cho người đọc

Không cần đăng nhập.

| Trang | Có gì |
|---|---|
| **Bản tin** | Dải số liệu thị trường (dầu WTI/Brent, vàng, lợi suất Mỹ 2/10/30 năm, Nhật 10/30 năm, thay đổi so phiên trước). Nút ‹ › để đổi ngày, tab để chọn **Bản tin sáng** hoặc **Trước phiên Mỹ**. Sự kiện quan trọng sắp tới. Các tin xếp dạng lưới so le, tin quan trọng nhất ở hàng đầu. |
| **Lịch sự kiện** | FOMC, BOJ, CPI, NFP, PCE, PPI, GDP, JOLTS, đấu giá trái phiếu Mỹ — giờ Việt Nam, lọc "Rất quan trọng" hoặc "Tất cả". |
| **Biểu đồ** | Lợi suất Mỹ, lợi suất Nhật, giá dầu, giá vàng — chọn 1 tháng / 3 tháng / 1 năm. |

Mỗi thẻ tin có: nhãn **Tin nóng** (nếu được ghim), danh mục, mức tác động, chiều tác động (tiêu cực / trung lập / tích cực), tiêu đề, nguồn, giờ đăng và đoạn đầu tóm tắt.

- **Xem thêm** — mở popup đọc toàn bộ tóm tắt.
- **Đọc bài gốc** — mở bài báo gốc ở tab mới.
- Nút ☾ / ☀ ở góc phải đổi giao diện tối / sáng.

> Tóm tắt do AI viết, **chỉ dựa trên nội dung bài gốc**; tin không qua được bước kiểm tra trung thực sẽ không được đăng. Luôn đọc bài gốc trước khi ra quyết định đầu tư.

---

## 2. Dành cho quản trị

### 2.1 Đăng nhập

1. Bấm **Đăng nhập** (biểu tượng ổ khóa) ở góc phải trên cùng, hoặc vào thẳng `/dang-nhap`.
2. Nhập **tên đăng nhập** (giá trị `ADMIN_USERNAME`) → **Gửi mã đăng nhập**.
3. Mở email `ADMIN_EMAIL`, nhập **mã 6 số** → **Đăng nhập**.

Phiên đăng nhập có hiệu lực **15 ngày** kể từ lần nhập mã gần nhất. Sai mã hoặc gửi mã quá nhiều lần sẽ bị chặn tạm thời (5 lần gửi / 10 lần nhập mỗi giờ). Khi đã đăng nhập, góc phải hiện nút **Quản trị** (biểu tượng bánh răng).

### 2.2 Trên trang Bản tin

Cuối trang có nút **Xem thêm tin**: thêm khoảng 4 tin nữa vào bản tin đang xem (chạy 1–2 phút, giới hạn lượt mỗi ngày). Tin thêm vào cũng được tóm tắt, dịch và kiểm tra trung thực như tin tự động, và hiển thị cho mọi người đọc.

### 2.3 Trang Vận hành (`/quan-tri`)

| Khối | Dùng để |
|---|---|
| **Cập nhật tin mới** | Lấy tin phát sinh sau lần chạy gần nhất và bổ sung vào bản tin hôm nay (chạy trên GitHub Actions, 5–15 phút). Chọn bản tin cần cập nhật. |
| **AI hôm nay** | Số request / token đã dùng của từng model so với hạn mức miễn phí. Router tự chuyển model khi chạm 80%. |
| **Nút bấm & lịch tự động** | Số lượt đã bấm hôm nay (Xem thêm, Cập nhật tin mới, AI gợi ý) và các lần pg_cron đã gọi GitHub để chạy bản tin. |
| **Model AI (dùng chung)** | Bật/tắt model, thứ tự ưu tiên, hạn mức request/token theo ngày và theo phút. |
| **Các lần chạy gần đây** | 15 lần chạy gần nhất: số tin đã chấm / chọn / dịch / bỏ / loại và lỗi nếu có. |
| **Nguồn đang lỗi** | Nguồn tin bị lỗi ở lần lấy gần nhất. |

### 2.4 Trang Cấu hình (`/quan-tri/cau-hinh`)

Mọi mục hiển thị **chỉ đọc**. Chỉ **công tắc Bật/Tắt** có tác dụng ngay khi bấm. Muốn sửa: bấm **✏️** (hoặc **Thêm**) → sửa trong popup → **OK** để lưu, **Hủy** để bỏ. Thay đổi áp dụng từ **lần chạy kế tiếp**, không cần deploy.

| Mục | Sửa được gì |
|---|---|
| **Cài đặt chung** | Trần request AI mỗi ngày, độ dài tóm tắt (số từ), số tin và số lượt mỗi ngày của các nút Xem thêm / Cập nhật / AI gợi ý, **từ khóa bỏ hẳn tin** (tin rác như trang giá, "price today"). Rê chuột vào ⓘ để xem giải thích. |
| **Bản tin** | Giờ chạy (theo múi giờ của bản tin, ví dụ `UTC+7 · Giờ Việt Nam`), ngày chạy trong tuần, số tin tối thiểu – tối đa, có cập nhật số liệu thị trường hay không. Tên bản tin cố định. |
| **Thứ tự ưu tiên** | Các nhóm tin được lấp từ trên xuống. Kéo **⠿** để đổi thứ tự; ✏️ / **Thêm nhóm** để chọn danh mục (dropdown), cách lấy tin, **Tối đa**, **Điểm sàn**, **Sàn tin 2+**; 🗑️ để xóa. |
| **Danh mục** | Từ khóa nhận diện, từ khóa ngoại lệ, mô tả cho AI. Tên và mã danh mục cố định. Có **AI gợi ý** (xem 2.5). |
| **Nguồn tin** | Thêm / sửa / xóa nguồn RSS hoặc Google News: URL hoặc truy vấn, danh mục mặc định (dropdown), điểm uy tín (≥ 10 = nguồn chính thức, luôn qua bước lọc). Cột cuối hiện lỗi gần nhất. |
| **Số liệu & lịch** | Bật/tắt và đổi tên các module: giá dầu, giá vàng, lợi suất Mỹ, lợi suất Nhật, lịch sự kiện vĩ mô. Tắt module thì dữ liệu cũ vẫn giữ. |

**Cách hệ thống dùng từ khóa** (tiếng Anh, vì tin gốc là tiếng Anh):

- Khớp **nguyên từ**, không phân biệt hoa thường, chấp nhận số nhiều `s`/`es`. Từ kết thúc bằng `*` khớp phần đầu từ (`tariff*` khớp `tariffs`, `tariffed`).
- Tin có **từ khóa nhận diện** → xếp vào danh mục đó; nếu đồng thời có **từ khóa ngoại lệ** của danh mục thì không xếp vào danh mục đó (ví dụ mục Dầu có ngoại lệ `olive oil`).
- Tin có **từ khóa bỏ hẳn tin** (Cài đặt chung) bị loại ngay từ đầu, trừ nguồn chính thức.

**Điểm của tin** ≈ mức tác động AI chấm (0–10) × 10, cộng thêm khi nguồn uy tín hoặc nhiều báo cùng đưa tin, trừ dần khi tin đã cũ. **Điểm sàn** của một nhóm là điểm tối thiểu để tin được chọn vào nhóm đó.

### 2.5 AI gợi ý từ khóa và mô tả cho danh mục

1. Cấu hình → **Danh mục** → bấm ✏️ ở danh mục cần sửa.
2. Trong khung **AI gợi ý**, mô tả danh mục cần theo dõi tin gì (tiếng Việt được, tối đa 600 ký tự), ví dụ: *"giá vàng thế giới, ngân hàng trung ương mua vàng, quỹ ETF vàng; không lấy tin trang sức"*.
3. Bấm **Gợi ý** (vài giây). AI trả về từ khóa nhận diện, từ khóa ngoại lệ và mô tả cho AI.
4. Bấm từng chip **+** để thêm, hoặc **Thêm tất cả**; bấm **Dùng mô tả này** để đưa mô tả vào ô.
5. Xem lại rồi bấm **OK** để lưu. **AI không tự lưu gì.**

Mỗi lần bấm Gợi ý dùng 1 request AI; mặc định tối đa **10 lượt/ngày** (sửa trong Cài đặt chung).

---

## 3. Lịch chạy và hạn mức

| Bản tin | Giờ chạy | Ngày | Số tin |
|---|---|---|---|
| Bản tin sáng | 06:00 giờ Việt Nam | Hằng ngày | 10–12 |
| Trước phiên Mỹ | 08:45 giờ New York | Thứ Hai – Thứ Sáu | 6–8 |

- Supabase **pg_cron** kiểm tra mỗi 5 phút và gọi GitHub Actions khi đến giờ. Dự phòng: GitHub tự chạy `catch-up` lúc 07:30 VN và sau 08:45 New York nếu bản tin trong ngày chưa chạy.
- Mỗi bản tin chỉ tạo 1 lần/ngày; chạy lại chỉ làm nốt phần dang dở.
- **Hết hạn mức AI giữa chừng:** tin đã chọn giữ nguyên trạng thái, lần chạy kế tiếp làm tiếp — không mất dữ liệu, không trả phí.
- Trần mặc định: 60 request AI/ngày cho cả hệ thống; Xem thêm 5 lượt, Cập nhật tin mới 3 lượt, AI gợi ý 10 lượt mỗi ngày.

---

## 4. Phát triển

### 4.1 Yêu cầu

- Node.js **24+** (worker chạy file `.ts` trực tiếp, không cần build)
- pnpm **10** (`corepack enable`, hoặc `npx pnpm@10.34.7 …`)
- Tùy chọn: Supabase CLI + Docker (DB local), Deno 2 (kiểm tra Edge Functions)

### 4.2 Cài đặt

```bash
pnpm install
```

Biến môi trường (không commit — repo public):

| File | Biến | Dùng cho |
|---|---|---|
| `apps/web/.env.local` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Web chạy local (anon key là public, mọi bảng được RLS bảo vệ) |
| `.env` (thư mục gốc) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (bắt buộc); `GROQ_API_KEY`, `GEMINI_API_KEY`, `FRED_API_KEY`, `EIA_API_KEY`, `SEC_USER_AGENT` (tùy chọn) | Worker chạy local |

### 4.3 Lệnh thường dùng

```bash
pnpm --filter @news-coming/web dev       # web local (Vite)
pnpm --filter @news-coming/web build     # build web
pnpm typecheck                           # typecheck mọi package
pnpm test                                # Vitest (web + worker + code dùng chung)
pnpm db:start && pnpm db:reset           # Supabase local: chạy toàn bộ migration + seed
pnpm db:test                             # pgTAP: test RLS, bật/tắt
pnpm verify:sources                      # kiểm tra các nguồn tin còn sống
pnpm dry-run                             # thử bước lấy + lọc tin với Postgres nhúng (không cần key, không ghi gì)
```

Worker (đọc `.env` ở thư mục gốc):

```bash
cd apps/worker
node --env-file=../../.env src/index.ts edition --edition morning   # tạo bản tin (morning | pre_us)
node --env-file=../../.env src/index.ts edition --edition morning --refresh   # bổ sung tin mới vào bản tin hôm nay
node --env-file=../../.env src/index.ts collect                     # chỉ lấy tin
node --env-file=../../.env src/index.ts modules                     # chỉ cập nhật giá / lợi suất / lịch
node --env-file=../../.env src/index.ts catch-up                    # chạy bản tin đến hạn mà hôm nay chưa chạy
node --env-file=../../.env src/index.ts verify-ai                   # kiểm tra key và model AI
```

Trên GitHub, các lệnh trên chạy được bằng tay ở **Actions → Run worker → Run workflow**.

### 4.4 Quy tắc

- Mọi thay đổi qua **PR vào `main`**; không push thẳng `main`.
- Commit message tối đa 2 dòng, không ghi tên AI.
- Migration chỉ thêm mới (forward-only), không sửa migration đã merge; seed dùng `on conflict do nothing`.
- Không dùng dịch vụ trả phí; thêm dịch vụ ngoài mới (kể cả miễn phí) phải hỏi trước.
- Chi tiết: [AGENTS.md](AGENTS.md) và `.agents/rules/`.

---

## 5. Deploy

Merge vào `main` → CI xanh → `deploy.yml` tự deploy **chỉ phần thay đổi**, theo thứ tự:

1. **DB migrations** (`supabase db push`)
2. **Edge Functions** (`supabase functions deploy`)
3. **Web** (build → Netlify)
4. **Worker**: dời tag `prod` (worker luôn chạy code ở tag này)

Secrets cần có:

| Nơi | Tên |
|---|---|
| GitHub Secrets | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `FRED_API_KEY`, `EIA_API_KEY`, `SEC_USER_AGENT` |
| GitHub Variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `WEB_DEPLOY_ENABLED` (đặt `false` để tạm dừng deploy web) |
| Supabase Edge Function secrets | `ADMIN_USERNAME`, `ADMIN_EMAIL`, `LOGIN_HASH_SALT`, `GITHUB_DISPATCH_TOKEN`, `GROQ_API_KEY`, `GEMINI_API_KEY` |
| Supabase Vault | `github_dispatch_token` (cho pg_cron gọi GitHub) |

Cài đặt một lần (token GitHub cho pg_cron, SMTP Resend cho mã đăng nhập) và cách rollback: xem [docs/DESIGN.md](docs/DESIGN.md) §3.1, §10.2, §13.

---

## 6. Cấu trúc dự án

```
apps/
  web/                    # Vite + React SPA (HeroUI v3, Tailwind v4, TanStack Query)
    src/features/         #   digest · calendar · charts · auth · admin
  worker/                 # Node 24, chạy trên GitHub Actions
    src/sources/          #   RSS, Google News, SEC EDGAR, …
    src/pipeline/         #   thu thập, lọc từ khóa, gom cụm, tạo bản tin
    src/modules/          #   giá dầu, vàng, lợi suất, lịch sự kiện
supabase/
  migrations/             # schema, RLS, seed cấu hình, pg_cron
  functions/
    _shared/              # code dùng chung worker + Edge Functions: AI router, prompt, chấm điểm, chọn tin
    admin-login/          # đăng nhập bằng mã OTP
    more-news/            # nút "Xem thêm tin"
    trigger-refresh/      # nút "Cập nhật tin mới"
    category-assist/      # "AI gợi ý" cho danh mục
  tests/                  # pgTAP
docs/DESIGN.md            # thiết kế chi tiết (nguồn sự thật)
.github/workflows/        # ci.yml · deploy.yml · run.yml
```
