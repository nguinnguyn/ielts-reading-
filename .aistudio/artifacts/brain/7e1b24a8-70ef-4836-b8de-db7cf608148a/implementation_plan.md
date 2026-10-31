# IELTS on Computer — Reading Simulator (Cloud & AI Edition)

Nâng cấp và hoàn thiện ứng dụng luyện thi **IELTS Reading trên máy tính (Inspera Simulator)** dựa trên cấu trúc giao diện hiện tại của bạn: giữ nguyên trải nghiệm phòng thi chia đôi màn hình quen thuộc, tinh chỉnh giao diện & sửa lỗi tương tác, tích hợp AI phía máy chủ để bóc tách chuẩn xác mọi định dạng đề PDF mà không cần nhập API Key, đồng thời bổ sung đăng nhập tài khoản và đồng bộ đám mây Firebase.

## User Review & Critical Decisions

> [!IMPORTANT]
> Dưới đây là các quyết định thiết kế đã được chốt dựa trên lựa chọn của bạn trước khi tiến hành xây dựng:

- **Giữ nguyên cấu trúc cốt lõi & Tinh chỉnh giao diện**: Bảo toàn luồng trải nghiệm 2 màn hình chính (*Màn hình tải đề/cài đặt giờ* và *Không gian phòng thi Split-Pane chuẩn Inspera*), sửa các lỗi bôi sáng văn bản (Highlight), hộp thoại chỉnh giờ (thay thế `window.prompt` bị chặn trong khung nhúng bằng popover trực tiếp) và nâng cấp độ sắc nét của bảng điều hướng 40 câu hỏi.
- **Tự động hóa bóc tách PDF bằng AI phía Server (Không cần nhập API Key)**: Loại bỏ hoàn toàn ô nhập Gemini API Key thủ công trên giao diện. Khi tải file PDF lên, bộ lọc tọa độ không gian `pdf.js` sẽ loại bỏ watermark/chân trang và gửi văn bản sạch lên máy chủ để mô hình `gemini-3.8-flash` chuẩn hóa 100% thành 3 Passage, 40 câu hỏi (đầy đủ dạng *TFNG, Yes/No/NG, MCQ, Matching Headings/Information, Gap-fill*) và bộ đáp án (*Answer Key*).
- **Tài khoản & Đồng bộ đám mây (Firebase Auth + Firestore)**: Cho phép đăng nhập bằng tài khoản Google để tự động lưu trữ các đề PDF đã bóc tách, lịch sử làm bài (điểm số, Band IELTS, thời gian hoàn thành, đáp án đã chọn) và hệ thống Highlight/Ghi chú xuyên suốt nhiều thiết bị.

---

## 1. Overview & Core Concept

- **Chức năng chính**: Chuyển đổi bất kỳ file PDF đề thi IELTS Reading nào thành bài thi tương tác trên máy tính giống kỳ thi thật của IDP/British Council, tự động chấm điểm, quy đổi Band và lưu trữ đám mây.
- **Đối tượng sử dụng**: Thí sinh luyện thi IELTS muốn làm quen với áp lực thời gian, thao tác Highlight/Notes trên máy tính và lưu lại kho đề cá nhân để ôn tập lại trên nhiều thiết bị.
- **Giá trị cốt lõi**:
  - Xử lý triệt để các file PDF phức tạp hoặc có dính watermark/chân trang tiếng Việt & tiếng Anh nhờ sự kết hợp giữa thuật toán lọc không gian `X/Y` và mô hình ngôn ngữ lớn phía máy chủ.
  - Không còn mất dữ liệu đề thi hay lịch sử làm bài khi tải lại trang hoặc đổi máy tính.

---

## 2. User Experience & Visual Design

### Luồng trải nghiệm người dùng (Key User Flows)
1. **Màn hình Thiết lập & Thư viện Đám mây (Setup & Cloud Library Modal)**:
   - Người dùng có thể **Đăng nhập với Google** ở góc trên để đồng bộ dữ liệu (hoặc làm bài ngay ở chế độ khách).
   - **Tải đề PDF mới**: Kéo thả file PDF -> Hệ thống lọc watermark bằng `pdf.js` -> Gửi lên Server AI phân tích cấu trúc -> Hiển thị thông báo số lượng Passage, Câu hỏi và Đáp án tìm thấy.
   - **Thư viện đề đã lưu & Lịch sử làm bài**: Hiển thị danh sách các đề đã từng tải lên trên đám mây cùng điểm Band cao nhất và nút *Làm lại (Retake)* hoặc *Xem lại bài làm (Review)*.
   - **Cài đặt thời gian**: Chọn nhanh `20 phút`, `40 phút`, `60 phút`, `Untimed` hoặc nhập số phút tùy chỉnh, sau đó nhấn **Start IELTS Reading Test**.
2. **Không gian Phòng thi (Inspera Split-Pane Exam Workspace)**:
   - **Thanh công cụ trên cùng (Top Header)**: Chuyển đổi nhanh `Part 1`, `Part 2`, `Part 3`; đồng hồ đếm ngược có nút ẩn/hiện và popover đặt lại giờ trực tiếp; nút mở ngăn kéo `Notes`; bộ chọn 3 chế độ màu tương phản (*Black on White*, *White on Black*, *Yellow on Black*); bộ chọn 3 cỡ chữ (*Standard*, *Large*, *Extra Large*); nút mở màn hình tải đề/thư viện và nút **Submit**.
   - **Khung làm bài chia đôi (Resizable Split-Pane)**:
     - *Khung trái (Reading Passage)*: Hiển thị tiêu đề và các đoạn văn rõ ràng (A, B, C...), giữ nguyên các đoạn đã bôi sáng khi chuyển Part.
     - *Thanh kéo giữa (Resizer)*: Kéo mượt mà từ 20% đến 80% chiều rộng màn hình.
     - *Khung phải (Questions)*: Hiển thị nhóm hướng dẫn (*Group Instructions*) và các thẻ câu hỏi tương tác với huy hiệu số thứ tự nổi bật, tự động cuộn mượt tới câu hỏi khi chọn ở thanh dưới.
   - **Hệ thống Highlight 5 màu & Sticky Notes**: Bôi đen bất kỳ từ/cụm từ nào ở khung bài đọc hoặc khung câu hỏi để mở thanh chọn 5 màu (*Vàng, Xanh lá, Xanh dương, Hồng, Cam*) và nút `+ Note`. Nhấn vào đoạn đã highlight để sửa ghi chú, đổi màu hoặc xóa.
   - **Thanh điều hướng 40 câu hỏi dưới cùng (Bottom Navigation Bar)**: Các ô số từ `1` đến `40` hiển thị rõ trạng thái: *Chưa trả lời (Viền trắng)*, *Đã trả lời (Xanh dương)*, *Đánh dấu xem lại (Vàng cam tròn)* và *Câu hiện tại (Viền sáng)*.
3. **Báo cáo Điểm số & Đối chiếu Đáp án (Score Report Modal)**:
   - Hiển thị tổng số câu đúng (`/ 40`), quy đổi **IELTS Band** (`2.5` – `9.0`), và tổng thời gian làm bài.
   - Bảng đối chiếu chi tiết từng câu giữa câu trả lời của người dùng và đáp án chuẩn. Nhấn vào bất kỳ câu nào trong bảng kết quả sẽ đóng hộp thoại và nhảy thẳng tới câu hỏi đó trong giao diện bài thi để xem lại.

### Định hướng Thẩm mỹ & Giao diện (Visual Identity & Theme)
- **Aesthetic Direction**: Giữ phong cách chuẩn phòng thi học thuật (Utilitarian Exam Simulation) — tối giản, tập trung tối đa vào khả năng đọc văn bản dài (long-form legibility) và độ tương phản chuẩn WCAG AA.
- **Color Palette & 3 Contrast Themes**:
  - *Black on White (Default)*: Nền trang giấy `#F8FAFC` / `#FFFFFF`, chữ `#0F172A`, thanh điều hướng tối `#0F172A`, điểm nhấn xanh lam `#2563EB`.
  - *White on Black (Dark Mode)*: Nền `#0F172A` / `#1E293B`, chữ `#F1F5F9`, viền `#334155`, đảm bảo không bị lỗi chữ đen trên nền tối ở các ô nhập liệu và thẻ câu hỏi.
  - *Yellow on Black (High Contrast)*: Nền đen tuyền `#000000`, chữ và viền vàng `#FACC15` / `#CA8A04` chuẩn trợ năng phòng thi máy.
- **Typography & Hierarchy**:
  - Phông chữ giao diện và câu hỏi: `Plus Jakarta Sans` kết hợp `Source Serif 4` hoặc văn bản rõ nét cho bài đọc dài; số liệu đồng hồ và điểm số sử dụng `tabular-nums` (chữ số đẳng rộng) để không bị giật khung khi đồng hồ chạy từng giây.

---

## 3. Key Product Decisions & Trade-Offs

- **Quyết định 1: Kết hợp Bộ lọc Không gian (Spatial PDF Filter) + Server-Side Gemini AI**
  - *Giải pháp lựa chọn*: Trích xuất văn bản có tọa độ `X/Y` bằng `pdf.js` ngay trên trình duyệt để loại bỏ header/footer/watermark, sau đó gửi văn bản đã làm sạch lên API máy chủ (`/api/parse-pdf`) sử dụng `gemini-3.8-flash` với cấu trúc JSON (`responseSchema`) nghiêm ngặt, kèm cơ chế dự phòng (fallback) bằng bộ phân tích cục bộ nếu mạng gián đoạn.
  - *Lý do*: Loại bỏ hoàn toàn thao tác nhập API key thủ công của người dùng, bảo mật khóa hệ thống và xử lý chính xác cả những đề PDF có bố cục phức tạp (như *List of Headings* đặt trước bài đọc, câu hỏi *Choose TWO letters*, hay đáp án giải thích bằng tiếng Việt).
- **Quyết định 2: Thay thế `window.prompt` bằng Popover chỉnh giờ trực tiếp**
  - *Giải pháp lựa chọn*: Sử dụng hộp thoại nhỏ (Inline Popover) ngay dưới nút `Set Time` trên thanh Header thay vì hàm `prompt()` mặc định của trình duyệt.
  - *Lý do*: Trong môi trường khung nhúng (iframe) hiện đại, `window.prompt` và `window.alert` thường bị trình duyệt chặn làm nút chỉnh giờ không hoạt động.
- **Quyết định 3: Lưu trữ đám mây bằng Firebase Firestore**
  - *Giải pháp lựa chọn*: Lưu cấu trúc đề thi đã bóc tách vào bộ sưu tập `exams` và kết quả/ghi chú của từng lần làm bài vào `attempts` gắn với `userId` của người dùng đăng nhập qua Google.
  - *Lý do*: Giúp người dùng tải PDF một lần trên máy tính và có thể mở lại đề đó hoặc xem lịch sử tiến bộ trên bất kỳ thiết bị nào khác.

---

## 4. Technical Architecture & Data Strategy

### Sơ đồ Kiến trúc Hệ thống (Architecture & Component Diagram)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TRÌNH DUYỆT (CLIENT WORKSPACE)                       │
│                                                                             │
│  ┌──────────────────────────┐         ┌──────────────────────────────────┐  │
│  │  Setup & Cloud Library   │         │   Inspera Exam Workspace         │  │
│  │  - PDF Spatial Extractor │────────▶│   - Top Bar (Parts, Timer, Theme)│  │
│  │  - Saved Exams & History │         │   - Split-Pane (Passage / Qs)    │  │
│  │  - Timer Preset Selector │         │   - 5-Color Highlighter & Notes  │  │
│  └────────────┬─────────────┘         │   - Bottom 1-40 Question Nav     │  │
│               │                       └─────────────────┬────────────────┘  │
│               │                                         │                   │
│               ▼                                         ▼                   │
│  ┌──────────────────────────┐         ┌──────────────────────────────────┐  │
│  │  POST /api/parse-pdf     │         │   Score Report & Review Modal    │  │
│  │  (Cleaned PDF Text)      │         │   - Band Calculator (2.5 - 9.0)  │  │
│  └────────────┬─────────────┘         │   - Key Comparison & Jump-to-Q   │  │
└───────────────┼─────────────────────────────────────────┼───────────────────┘
                │                                         │
                ▼                                         ▼
┌──────────────────────────────┐        ┌─────────────────────────────────────┐
│   EXPRESS SERVER BACKEND     │        │     FIREBASE CLOUD SERVICES         │
│   - @google/genai SDK        │        │     - Google Authentication         │
│   - Model: gemini-3.8-flash  │        │     - Firestore:                    │
│   - Structured JSON Schema   │        │       • /users/{uid}                │
│     (Passages, Q1-40, Keys)  │        │       • /exams/{examId}             │
└──────────────────────────────┘        │       • /attempts/{attemptId}       │
                                        └─────────────────────────────────────┘
```

### Mô hình Dữ liệu & Trạng thái (Data Model & State)
- **Đề thi (`ExamDocument` trong Firestore `/exams/{examId}`)**:
  - `ownerId`: UID của người tải lên.
  - `title`: Tên đề thi trích xuất từ PDF.
  - `parts`: Mảng 3 phần (`Part 1`, `Part 2`, `Part 3`), mỗi phần gồm `id`, `title`, `instructions`, `content` (HTML đoạn văn), `questions` (danh sách câu hỏi `tfng | yes_no | mcq | select | fill` kèm `options` và `groupTitle`), và `answers` (bộ đáp án chuẩn).
  - `createdAt`: Thời gian lưu đề.
- **Lượt làm bài (`AttemptDocument` trong Firestore `/attempts/{attemptId}`)**:
  - `ownerId`: UID của người làm bài.
  - `examId` & `examTitle`: Liên kết tới đề thi.
  - `userAnswers`: Bản đồ câu trả lời `{ "1": "TRUE", "2": "investment", ... }`.
  - `score`, `totalQuestions`, `bandScore`, `timeSpentSeconds`.
  - `highlights`: Danh sách các đoạn highlight 5 màu và ghi chú (`notesRegistry`) kèm nội dung HTML đã đánh dấu để khôi phục nguyên trạng khi xem lại.
  - `completedAt`: Thời gian nộp bài.

### Ánh xạ Tương tác & Xử lý Trạng thái (Interactive Component & State Mapping)
- **Quy trình Tải & Phân tích PDF**:
  1. Người dùng chọn hoặc kéo thả file `.pdf`.
  2. `pdf.js` đọc từng trang, gom dòng theo tọa độ `Y` (sai số `4.5px`), cắt bỏ lề trên/dưới `3.5%` và lọc sạch các dòng watermark lặp lại.
  3. Gửi văn bản sạch lên endpoint `/api/parse-pdf` trên server để `gemini-3.8-flash` bóc tách thành JSON chuẩn; nếu đề quá dài hoặc cần phản hồi tức thì, kết hợp bộ phân tích Universal Scanner để đảm bảo đủ 40 câu hỏi và đáp án.
  4. Nếu người dùng đã đăng nhập, tự động lưu đề vào Firestore `/exams` để lần sau có thể mở lại ngay không cần quét lại PDF.
- **Quy trình Làm bài, Highlight & Nộp bài**:
  1. Khi chọn đáp án hoặc gõ vào ô trống, cập nhật `userAnswers[qId]` và đổi màu nút số câu tương ứng ở thanh dưới cùng sang xanh dương (`answered`).
  2. Khi bôi đen văn bản, hiển thị thanh công cụ nổi 5 màu + nút `+ Note`, bọc đoạn chọn trong thẻ `<span data-hl-id="...">` và đồng bộ vào ngăn kéo `Notes`.
  3. Khi nhấn **Submit** (hoặc khi hết giờ), dừng bộ đếm, chấm điểm tự động (hỗ trợ viết tắt `T/F/NG`, `Y/N/NG`, chữ hoa/thường và các phương án thay thế cách nhau bởi dấu `/`), hiển thị bảng kết quả và lưu lượt làm bài vào Firestore `/attempts`.
