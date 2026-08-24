# Thiết kế giao diện mobile — Kết Nối

## Định hướng sản phẩm

**Kết Nối** là ứng dụng nhắn tin cá nhân ưu tiên giao tiếp nhanh, dễ thao tác bằng một tay và có điểm khác biệt là **chia sẻ màn hình trong cuộc gọi**. MVP sử dụng bố cục chân dung 9:16, thanh điều hướng dưới cố định, vùng chạm tối thiểu 44 pt và các màn hình gọi toàn màn hình theo nguyên tắc giao diện iOS hiện đại.

## Danh sách màn hình

| Màn hình | Nội dung chính | Hành động chính |
| --- | --- | --- |
| Đăng nhập | Số điện thoại, xác nhận mã và liên kết chính sách | Tiếp tục vào không gian chat |
| Tin nhắn | Ô tìm kiếm, hàng thao tác nhanh, danh sách cuộc trò chuyện có trạng thái và tin nhắn mới | Mở chat, tạo chat, tìm kiếm |
| Cuộc trò chuyện | Tiêu đề người nhận, trạng thái trực tuyến, luồng bong bóng tin nhắn, vùng soạn tin, đính kèm và ghi âm | Gửi tin, gọi thoại, gọi video, mở tệp |
| Cuộc gọi video | Video người gọi/toàn màn hình, cửa sổ xem trước, thời lượng và các điều khiển gọi | Tắt tiếng, đổi camera, bật video, bật chia sẻ màn hình, kết thúc |
| Chia sẻ màn hình | Trạng thái đang chia sẻ, cảnh báo quyền riêng tư và các bước ngắt chia sẻ rõ ràng | Bắt đầu hoặc dừng chia sẻ |
| Danh bạ | Tìm kiếm, lời mời kết nối, danh sách bạn bè trực tuyến | Mở chat hoặc gọi nhanh |
| Nhật ký | Các cuộc gọi gần đây, cuộc gọi nhỡ và thời lượng | Gọi lại hoặc mở chat |
| Cá nhân | Ảnh đại diện, quyền riêng tư, thiết bị, cấu hình mạng và trợ giúp | Chỉnh hồ sơ, mở cài đặt |

## Luồng người dùng trọng tâm

Người dùng vào tab **Tin nhắn**, chạm vào một cuộc trò chuyện, sau đó có thể gửi nội dung từ vùng nhập ở đáy màn hình. Từ đầu trang chat, người dùng chọn gọi thoại hoặc gọi video. Trong cuộc gọi video, nút **Chia sẻ** mở một bảng xác nhận giải thích rằng mọi nội dung trên màn hình có thể được người bên kia nhìn thấy; khi xác nhận, trạng thái chia sẻ hiển thị nổi bật và luôn có nút dừng trong tầm với của ngón cái.

Người dùng cũng có thể bắt đầu từ tab **Danh bạ**: chọn một liên hệ, xem hồ sơ rút gọn rồi mở chat hoặc gọi ngay. Tab **Nhật ký** giúp gọi lại từ các cuộc gọi gần đây, còn tab **Cá nhân** dành cho quản lý thiết bị, quyền riêng tư và cấu hình kết nối.

## Màu sắc và phong cách

| Vai trò | Màu | Cách dùng |
| --- | --- | --- |
| Xanh Kết Nối | `#1577E8` | Nút chính, trạng thái đang chọn, liên kết và bong bóng tin gửi đi |
| Xanh đêm | `#0A284A` | Thanh tiêu đề cuộc gọi, chữ đậm và vùng video tối |
| Nền sương | `#F4F7FB` | Nền danh sách và bề mặt phân lớp nhẹ |
| Trắng | `#FFFFFF` | Thẻ, thanh nhập và bong bóng tin nhận được |
| Xanh thành công | `#19A974` | Trạng thái trực tuyến và cuộc gọi đã kết nối |
| Đỏ ngắt gọi | `#E5484D` | Kết thúc cuộc gọi, cảnh báo và trạng thái cuộc gọi nhỡ |

Giao diện dùng chữ có độ tương phản cao, bo góc mềm 16–24 pt cho thẻ và bong bóng tin, đường phân cách mảnh. Hệ thống ưu tiên phản hồi ấn nhẹ, haptic tiết chế và trạng thái tải/đang gửi rõ ràng thay vì hiệu ứng phô trương.

## Nguyên tắc quyền riêng tư và cuộc gọi

Kết nối media được thiết kế theo **WebRTC P2P**: máy chủ chỉ hỗ trợ xác thực, báo hiệu và cấp thông tin ICE; luồng âm thanh/video đi trực tiếp khi mạng cho phép, hoặc qua TURN khi không thể xuyên NAT. Chia sẻ màn hình luôn đòi xác nhận rõ ràng của hệ điều hành và hiển thị dấu hiệu đang chia sẻ xuyên suốt cuộc gọi.

> Bản MVP sẽ dựng trải nghiệm, mô hình dữ liệu và hợp đồng cấu hình WebRTC. Cuộc gọi thật và chia sẻ màn hình trên iOS/Android cần một development build có mô-đun native WebRTC, máy chủ báo hiệu cùng hạ tầng TURN riêng trước khi phát hành.
