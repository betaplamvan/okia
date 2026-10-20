# ADR-0004 — Chakra UI, đa ngôn ngữ vi/en, responsive mobile-first

- **Ngày:** 2026-10-20
- **Trạng thái:** Chấp nhận (thay phần "chỉ tiếng Việt" và "Tailwind + shadcn/ui" trong các tài liệu trước)

## Bối cảnh

- Người chơi chủ yếu dùng điện thoại → giao diện phải responsive tốt.
- Muốn hỗ trợ hai ngôn ngữ Việt và Anh ở cả frontend và backend ngay từ đầu; thêm i18n sau sẽ phải sửa mọi chuỗi đã viết.
- Người phát triển chọn Chakra UI làm thư viện component.

## Quyết định

- **Chakra UI v3** thay cho Tailwind + shadcn/ui. Không dùng song song Tailwind.
- **next-intl** cho frontend; URL tiếng Việt không có tiền tố, tiếng Anh có `/en`.
- Backend có catalog dịch riêng và hàm `t()`; lỗi trả mã ổn định kèm thông điệp đã dịch.
- Nội dung trong database lưu JSONB `{vi, en}` có ràng buộc đủ hai ngôn ngữ.
- Responsive **mobile-first**, tối thiểu 320px. Chi tiết: [11](../11-responsive-i18n.md).

## Hệ quả

- ➕ Style props responsive của Chakra hợp với cách làm mobile-first; có sẵn color mode và component truy cập tốt.
- ➕ Thêm ngôn ngữ thứ ba sau này chỉ cần thêm file dịch và key trong JSONB.
- ➖ Mọi chuỗi phải đi qua `t()` từ ngày đầu; mỗi tính năng tốn thêm công dịch.
- ➖ Chakra v3 với App Router cần provider ở client component; trang SSR vẫn render được nhưng phải chú ý ranh giới server/client.
