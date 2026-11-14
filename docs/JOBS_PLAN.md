# Kế hoạch: trang tin việc làm Android / Mobile

> Trạng thái: **đã duyệt thiết kế, chưa code** (2026-11-15).
> Tài liệu này để bất kỳ agent nào cũng làm tiếp được. Khi một phần đã làm xong, chuyển nội dung
> tương ứng vào `docs/DESIGN.md` và xóa khỏi đây.

## 1. Bối cảnh

Chủ repo có một routine chạy trên Claude ("Android job scan", 07:45 mỗi sáng) tìm việc Android bằng
web search, xác minh từng tin còn hạn, chấm điểm theo CV và ghi báo cáo. Gói Claude Pro hết hạn sau
ngày 2026-11-15, nên việc này được chuyển thành một pipeline trong worker, chạy trên GitHub Actions.

Routine cũ **không** gửi email; pipeline mới cũng không gửi email hay tạo issue.

## 2. Quyết định đã chốt

| Chủ đề | Quyết định |
|---|---|
| Nơi chạy | Worker trên GitHub Actions, 1 lần/ngày lúc 07:45 giờ Việt Nam, có nút chạy tay |
| Điều kiện lấy tin | Tiêu đề có `android` hoặc `mobile`; Hồ Chí Minh hoặc remote nhận người ở Việt Nam; đăng/làm mới trong 14 ngày. Không có truy vấn riêng cho POS/PAX/Sunmi |
| Loại tin | Chỉ bằng code: sai từ khóa, sai địa điểm, quá 14 ngày, có dấu hiệu hết hạn |
| Hồ sơ CV | **Chỉ dùng để chấm điểm**, không bao giờ dùng để loại tin. Tin điểm thấp vẫn hiển thị |
| Tin không đọc được trang chi tiết | Vẫn hiển thị trong nhóm "Chưa xác minh" kèm ghi chú; người dùng tự bấm link kiểm tra |
| Quyền xem | Chỉ admin. Tách hẳn khỏi bảng tin tài chính |
| Tin đã báo trước đây | Không nhập lịch sử từ routine cũ; ngày chạy đầu hiển thị lại tất cả |
| Tìm kiếm | Gemini "Grounding with Google Search" (trả trước), trần **1 USD/tháng**; hết ngân sách hoặc lỗi → dự phòng miễn phí (DuckDuckGo) |
| Nhắc sắp hết credit | Chỉ hiển thị trên giao diện |

## 3. Kết quả thử nghiệm (nhánh `spike/job-sources`, chạy trên GitHub Actions 2026-11-14)

Script: `apps/worker/scripts/probe-job-sources.ts`, `apps/worker/scripts/probe-job-search.ts`;
workflow `.github/workflows/probe-job-sources.yml`. Mỗi nguồn mới thử một lần, và chỉ kiểm tra ở mức
"đọc được trang" (đếm chữ "android" và link tin), chưa tách lương/hạn/ngày đăng.

### 3.1 Đọc trực tiếp

| Nguồn | Danh sách | Trang chi tiết | Kết luận |
|---|---|---|---|
| ITviec | Trực tiếp 403; qua Jina được | Qua Jina được | Dùng, qua Jina |
| VietnamWorks | API `POST https://ms.vietnamworks.com/job-search/v1.0/search` trả JSON | Trực tiếp được | Dùng |
| LinkedIn | `jobs-guest/jobs/api/seeMoreJobPostings/search` trực tiếp được (10 tin) | Trực tiếp được (đổi host về `www.linkedin.com`) | Dùng |
| CareerViet | Trực tiếp được; qua Jina 403 | Trực tiếp được | Dùng; cần viết phần tách link |
| TopDev | Trang đọc được nhưng chưa tách được link; địa chỉ API thử bị sai | — | Chưa rõ, làm sau |
| Glassdoor | Trực tiếp 403; qua Jina được 30 link | Bị chặn cả hai đường | Chỉ lấy danh sách → "chưa xác minh" |
| TopCV | Bị chặn cả hai đường (máy cá nhân thì đọc được) | — | Chỉ qua tìm kiếm |
| JobsGo, Indeed VN | Bị chặn cả hai đường | — | Chỉ qua tìm kiếm |
| Trang công ty | VNG, Grab, Cake đọc được và có tin Android; MoMo, Be, Tiki, Katalon, Axon Active, Employment Hero, Trusting Social đọc được nhưng không thấy tin; KMS 403 | — | Dùng VNG, Grab, Cake trước |

Địa chỉ trang công ty là đoán; NAB, ELSA, Go Labs sai địa chỉ, Uplive chưa thử.

### 3.2 Tìm kiếm

| Đường | Kết quả |
|---|---|
| DuckDuckGo `https://html.duckduckgo.com/html/?q=` | Trả 10 link/truy vấn cho `site:topcv.vn`, `site:jobsgo.vn`, `site:vn.indeed.com`; bị chặn (HTTP 202) từ truy vấn thứ 4 liên tiếp, kể cả giãn 8 giây. Kết quả lẫn tin cũ và trang danh sách |
| Bing `?format=rss` | Kết quả rác (bỏ qua `site:`) — không dùng |
| Gemini tìm Google, key free | 429 trên mọi model Gemini 3.x: tính năng không có trong gói free |
| Gemini 2.5 | 404: không còn mở cho người dùng mới |
| Gemini tìm Google, key trả trước (`GEMINI_SEARCH_API_KEY`) | Hoạt động sau khi nạp credit (§10): 10 link TopCV cho một truy vấn `site:` |

## 4. Chi phí tìm kiếm (ngoại lệ đã duyệt của quy tắc zero cost)

Chủ repo duyệt ngày 2026-11-14: dùng Gemini API trả trước cho riêng việc tìm kiếm, **tối đa 1 USD/tháng**.

- Project Google Cloud riêng `news-coming-search`; key lưu ở GitHub Secret `GEMINI_SEARCH_API_KEY`.
  Key dịch thuật hiện tại (`GEMINI_API_KEY`) vẫn ở project free, không bật thanh toán.
- Gemini API tính kiểu **trả trước**: nạp tối thiểu 5 USD, credit hết hạn sau 12 tháng, hết credit thì
  mọi request trả 402. **Không bật auto-reload** → mất tối đa đúng số đã nạp.
- Bảng giá (đọc 2026-11-14): Gemini 3 trở lên — 5.000 lượt tìm miễn phí/tháng (dùng chung mọi model),
  sau đó 14 USD/1.000 lượt, trần 1.500 lượt/ngày; tính theo từng lượt tìm model thực hiện. Token của
  các lần gọi này tính tiền theo giá gói trả phí (đơn giá chưa đối chiếu — đo lại ở lần chạy thật đầu tiên).
- Chặn bằng code (bắt buộc, không dựa vào cảnh báo của Google):
  1. Sau mỗi lần gọi, đọc số token và số lượt tìm từ response, quy ra tiền theo đơn giá lưu trong DB,
     cộng vào sổ tháng (`search_spend`) bằng một hàm atomic chỉ `service_role` gọi được.
  2. Trước mỗi lần gọi: dừng nếu tổng tháng ≥ **0,80 USD** hoặc ≥ **4.000 lượt tìm**.
  3. Trần theo ngày = ngân sách còn lại / số ngày còn lại trong tháng.
- Lớp ngoài (chủ repo tự đặt): cảnh báo ngân sách 1 USD trên Google Cloud; "Monthly spend cap" 1 USD
  trong AI Studio (tính năng thử nghiệm).
- Hết ngân sách / 402 / lỗi → chuyển sang DuckDuckGo (≤ 3 truy vấn mỗi lần chạy). Pipeline không dừng.
- Giao diện hiện số dư ước tính (số đã nạp − tổng đã tiêu) và cảnh báo khi còn < 1 USD hoặc còn 30 ngày
  tới hạn 12 tháng của credit. Số tiền và ngày nạp do admin nhập ở trang Vận hành.

Cần cập nhật `.agents/rules/cost.md` (bảng dịch vụ được duyệt: Gemini trả trước cho tìm kiếm, DuckDuckGo)
và mục Project Goals trong `AGENTS.md` cùng PR đầu tiên có dùng chúng.

## 5. Dữ liệu

Dùng bảng riêng, **không** tạo topic mới: các policy public hiện tại đi theo topic, bảng riêng thì không
có đường nào lộ ra ngoài. Không cấp quyền nào cho `anon`.

| Bảng | Nội dung | admin | worker |
|---|---|---|---|
| `job_sources` | id, tên, loại (`direct` / `search` / `listing_only`), cấu hình, `enabled` | all | service_role |
| `jobs` | công ty, vị trí, địa điểm, lương, ngày đăng/làm mới, hạn, link, nguồn, trạng thái xác minh (`verified` / `unverified` / `closed`) + lý do, điểm, lý do chấm, gợi ý CV, nhóm hiển thị, ngày thấy đầu/cuối, ngày báo, trạng thái xử lý | select | service_role |
| `job_runs` | mỗi lần chạy: thời điểm, số tin mới, số tin loại vì hết hạn, lỗi theo nguồn | select | service_role |
| `search_spend` | theo tháng + provider: số lần gọi, lượt tìm, token vào/ra, tiền USD | select | service_role |
| `app_settings` (đã có) | khóa `job_profile` (hồ sơ chấm điểm), `job_search_budget` (trần tháng, đơn giá, số đã nạp, ngày nạp) | all | service_role |

- Chống trùng: unique theo link, và unique theo (công ty + vị trí đã chuẩn hóa). Tin cũ đổi lương hoặc
  hạn → báo lại với nhãn "cập nhật".
- Hồ sơ chấm điểm là **văn bản** admin dán vào popup (kỹ năng, số năm, cấp bậc, loại việc mong muốn);
  không tải file CV. Không đưa nội dung hồ sơ vào code/migration (repo public). Hồ sơ được gửi sang Groq
  khi chấm điểm → chỉ ghi kỹ năng và kinh nghiệm, không ghi họ tên, số điện thoại, email, địa chỉ.
- Dọn dữ liệu: thêm `jobs` (ví dụ giữ 90 ngày), `job_runs`, `search_spend` vào `purge_old_data()`.
- Test pgTAP: `anon` và user không phải admin không đọc được bất kỳ bảng nào ở trên.

## 6. Pipeline (lệnh `jobs` của worker)

1. **Đọc trực tiếp** các nguồn `direct` đang bật (mỗi nguồn một adapter nhỏ, test bằng fixture).
2. **Tìm kiếm** cho nguồn bị chặn (TopCV, JobsGo, Indeed) và truy vấn chung
   ("android developer", "mobile developer" + Hồ Chí Minh / remote Vietnam):
   Gemini tìm Google (trong ngân sách §4) → DuckDuckGo → bỏ qua.
   Link grounding của Gemini là link chuyển hướng: lấy header `location` để ra link thật.
3. **Danh sách không xác minh được** (Glassdoor qua Jina).
4. **Lọc + chống trùng** bằng code (§2).
5. **Xác minh** từng tin mới: tải trang chi tiết trực tiếp, không được thì qua Jina (giãn ≥ 3,1 giây,
   dùng chung giới hạn với bảng tin). Dấu hiệu đóng: "hết hạn", "đã hết hạn nộp hồ sơ", "ngừng nhận hồ sơ",
   "tin đã đóng", "expired", "no longer accepting", "this job is closed", 404, chuyển về trang danh sách,
   hạn nộp < hôm nay → `closed`, không hiển thị. Không tải được → `unverified` + lý do.
   ITviec/TopDev "Đăng X ngày trước" thường là lần làm mới → ghi "Làm mới dd/mm".
6. **Chấm điểm** 1–10 bằng Groq qua router AI hiện có, theo hồ sơ; kèm 1 câu lý do; 3 tin điểm cao nhất
   có thêm gợi ý nhấn mạnh trong CV. Nhóm: tối đa 3 `top`; 7–10 `fit`; 5–6 `maybe`; ≤ 4 `low`;
   không đọc được trang → `unverified` (bất kể điểm).
7. **Ghi kết quả** + `job_runs`.

Yêu cầu chung (theo mục tiêu dự án): mỗi bước idempotent và làm tiếp được; hết quota AI thì để phần
còn lại cho lần chạy sau. Thông tin của tin chỉ lấy từ chính trang đó; thiếu thì để trống ("—"),
không suy đoán (`.agents/rules/content-integrity.md`).

Lịch chạy: workflow riêng (`schedule` 00:45 UTC + `workflow_dispatch`), `concurrency` riêng để không
chồng với bảng tin. Chạy từ tag `prod` như `run.yml`.

## 7. Giao diện

### 7.1 Header (thay hàng chip chủ đề)

```
News Coming   [ Tài chính ] [ Việc làm ↗ ]      Bản tin · Lịch · Biểu đồ      ◐  ⚙ Quản trị
```

- Hai nút khu vực cạnh tên trang. "Việc làm ↗" **chỉ render khi `auth.isAdmin`**, mở `/viec-lam` ở tab mới
  (`target="_blank" rel="noopener noreferrer"`).
- `/` vẫn vào bảng tin tài chính.
- Menu giữa theo khu vực: tài chính = Bản tin · Lịch sự kiện · Biểu đồ; việc làm = Hôm nay · Tất cả.
- Màn hình nhỏ: nút khu vực ở dòng 1, menu xuống dòng 2 như hiện nay.

### 7.2 Trang `/viec-lam`

- Route tải lười (không làm nặng bundle public). Chưa đăng nhập → `/dang-nhap` rồi quay lại.
  Lớp chặn thật là RLS.
- Dòng tổng quan: tin mới, tin ≥ 7 điểm, tin hết hạn đã loại, ngân sách tìm kiếm đã dùng trong tháng.
  Dải cảnh báo khi sắp hết credit (§4).
- Chọn ngày giống bảng tin (URL giữ `?date=`).
- Nhóm: Nổi bật · Phù hợp · Cân nhắc · **Chưa xác minh** · Điểm thấp (thu gọn).
- Card: vị trí, công ty, điểm, lương, hạn hoặc "Làm mới dd/mm", nguồn, lý do, gợi ý CV (nhóm Nổi bật),
  nút "Xem tin" (tab mới, chỉ nhận http/https). Card chưa xác minh có nhãn và ghi chú
  "Không đọc được trang này, bấm để tự kiểm tra".
- Nội dung luôn render dạng text.

### 7.3 Trang Vận hành — khối "Việc làm"

Lần chạy gần nhất, nguồn đang lỗi, công tắc từng nguồn, chi tiêu tìm kiếm so với trần, số dư ước tính,
nút chạy tay, popup sửa hồ sơ chấm điểm, popup nhập số tiền/ngày nạp credit.

## 8. Thứ tự làm (mỗi bước một PR vào `main`)

1. Migration: bảng, RLS, hàm ghi chi tiêu, seed `job_sources` (`on conflict do nothing`), test pgTAP.
2. Worker: adapter nguồn trực tiếp, lọc, chống trùng, xác minh, chấm điểm, lệnh `jobs`, workflow hằng ngày.
3. Tìm kiếm: Gemini + sổ chi tiêu + dự phòng DuckDuckGo; cập nhật `cost.md`.
4. Web: header mới, trang `/viec-lam`, khối Vận hành.
5. Dọn dẹp: xóa nhánh `spike/job-sources` và script thử; chuyển nội dung tài liệu này vào `DESIGN.md`;
   cập nhật `AGENTS.md` và `README.md`.

Không có giai đoạn chạy song song với routine cũ (routine dừng khi hết gói Pro).

## 9. Việc còn mở

- Adapter cho trang tuyển dụng VNG, Grab, Cake (đã seed nguồn, chưa có code đọc) và các công ty còn lại.
- Glassdoor: ngày 2026-11-15 Jina cũng bị chặn → chưa có adapter; nguồn đã seed nhưng bị bỏ qua.
- TopDev: hiện chỉ lấy qua tìm kiếm (`site:topdev.vn/viec-lam`); chưa tìm ra địa chỉ đọc trực tiếp.
- Indeed: kết quả tìm kiếm chỉ trả trang danh sách, không phải tin cụ thể → chưa lấy được tin.
- DuckDuckGo: thời gian bị chặn kéo dài bao lâu, và bộ lọc theo thời gian có dùng được không.
- Cùng một vị trí đăng trên hai trang chỉ được gộp khi tên công ty + vị trí trùng nhau sau khi chuẩn hóa.

## 10. Số đo thực tế của tìm kiếm Gemini (GitHub Actions, 2026-11-15)

- Key trả trước hoạt động sau khi nạp 5 USD (trước đó: HTTP 402).
- Đơn giá `gemini-3.5-flash-lite` gói trả phí: 0,30 USD / 1 triệu token vào, 2,50 USD / 1 triệu token ra
  (gồm token suy luận). Lưu trong `app_settings.job_search_budget`, sửa được không cần deploy.
- Mỗi lần gọi với `maxOutputTokens = 400`: ~45 token vào, ~240 token ra, 2 lượt tìm → khoảng 0,0006 USD.
  6 truy vấn/ngày ≈ 0,11 USD/tháng và ~360 lượt tìm/tháng (miễn phí tới 5.000).
- Câu lệnh phải yêu cầu model liệt kê kết quả: nếu chỉ bảo "trả lời done" thì model không tìm kiếm.
- Chỉ dùng link trong `groundingChunks`; không dùng chữ model viết ra (có thể liệt kê tin không có trong kết quả).
- Truy vấn chung không kèm `site:` chỉ trả trang danh sách → chỉ dùng truy vấn `site:` cho TopCV, JobsGo, TopDev.
