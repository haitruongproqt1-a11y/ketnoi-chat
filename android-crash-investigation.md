# Android Startup Crash Investigation

## Dấu hiệu quan sát

APK Kết Nối bị Android buộc đóng ngay khi khởi chạy. Đây là crash native hoặc lỗi khởi tạo bridge trước khi giao diện React Native hiển thị.

## Phát hiện ban đầu

- Phiên bản `react-native-callkeep` đang dùng là nhánh ConnectionService cũ; có báo cáo tương thích không nhất quán với React Native New Architecture trên Android.
- Ứng dụng đang bật New Architecture trong cấu hình Expo, đồng thời nạp CallKeep ngay từ cây provider gốc.
- Tài liệu CallKeep khuyến nghị kiểm tra ConnectionService/PhoneAccount tại runtime trước khi gọi UI hệ thống; do đó cầu nối sẽ được gia cố bằng kiểm tra khả dụng và khởi tạo an toàn.

## Hướng xử lý

Ưu tiên tắt New Architecture cho Development APK hiện tại để đảm bảo tương thích legacy bridge của CallKeep, đồng thời tránh nạp hoặc gọi ConnectionService trên thiết bị không hỗ trợ. Cần xác minh qua prebuild và kiểm thử nguồn sau bản vá.

## Bản vá áp dụng

- Đã tắt New Architecture trong Expo config cho APK phát triển hiện tại, đưa CallKeep về legacy bridge tương thích hơn.
- Khởi tạo CallKeep hiện kiểm tra ConnectionService, bắt mọi native exception và chỉ đăng ký listener/hệ thống sau khi setup thành công.
- Mọi thao tác CallKeep sau đó đều có guard `initialized`, do đó ứng dụng vẫn mở và gọi WebRTC nội bộ được nếu ConnectionService không khả dụng.
