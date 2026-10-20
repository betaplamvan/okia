# Fixtures luật chơi dùng chung

Mỗi file `*.json` là một kịch bản được **cả** Vitest (`web/src/game/rules.test.ts`) và pytest (`api/tests/test_rules.py`) chạy. Hai bản luật lệch nhau → CI đỏ.

Định dạng và danh sách nhóm fixture tối thiểu: [`docs/03-luat-choi.md#fixtures-dùng-chung`](../../docs/03-luat-choi.md#fixtures-dùng-chung).

Đặt tên file: `<kích thước | mask | id-map>-<mô tả-ngắn>.json`, ví dụ `2x2-an-mot-o-di-tiep.json`. Fixture có trường `cells` là bàn có mặt nạ (map hình thù, xem docs/03 — Map).

Fixture "ván ngẫu nhiên đầy đủ" (`*-van-ngau-nhien-seed*.json`) do `web/scripts/gen-fixtures.mts` sinh từ engine TS với RNG có seed; chạy lại cho ra đúng cùng file. Map trong bể: `node scripts/gen-fixtures.mts map <id> <seed>`. Các fixture còn lại viết tay và đã kiểm tra từng nước.
