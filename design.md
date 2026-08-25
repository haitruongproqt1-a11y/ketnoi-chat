# Thiết kế giao diện mobile — Kết Nối

## Định hướng sản phẩm

**Kết Nối** là ứng dụng giao tiếp 1:1 Android-first, được tối giản quanh ba việc: vào tài khoản, tìm đúng bạn bè và liên lạc tức thời. Giao diện được thiết kế cho màn hình dọc 9:16 và thao tác một tay: hành động chính luôn nằm trong vùng chạm ở đáy hoặc góc trên dễ với tới, vùng chạm tối thiểu 44 pt, nội dung không đi vào khu vực notch hay thanh điều hướng. Phong cách lấy cảm hứng từ ứng dụng nhắn tin hiện đại, không sao chép tài sản hay nhận diện của sản phẩm khác.

## Danh sách màn hình

| Màn hình | Nội dung chính | Hành động chính |
| --- | --- | --- |
| Khởi động | Logo, kiểm tra phiên đã lưu và trạng thái mạng; không gọi camera, micro, WebRTC hoặc MediaProjection tại đây | Đi tới Đăng nhập hoặc Tin nhắn |
| Đăng ký | Tên hiển thị, tên đăng nhập, mật khẩu và lỗi nhập liệu theo trường | Tạo tài khoản, tự đăng nhập khi thành công |
| Đăng nhập | Tên đăng nhập, mật khẩu, ghi nhớ phiên và thông báo lỗi dễ hiểu | Đăng nhập, đi tới Tin nhắn |
| Tin nhắn | Danh sách hội thoại 1:1, trạng thái online và ô tìm kiếm hội thoại | Mở chat hoặc Danh bạ |
| Danh bạ/Tìm bạn | Tìm theo tên hiển thị hoặc tên đăng nhập, lời mời đang chờ và bạn bè đã xác nhận | Gửi lời mời, chấp nhận, mở chat |
| Chat 1:1 | Header tên/trạng thái bạn bè, danh sách tin, vùng soạn an toàn và ba nút liên lạc | Gửi tin, gọi thoại, gọi video, khởi tạo chia sẻ màn hình |
| Cuộc gọi thoại | Avatar, tên, trạng thái ringing/connecting/connected, thời lượng sau khi kết nối | Bật/tắt micro, loa ngoài, kết thúc |
| Cuộc gọi video | Video đối phương là bề mặt chính, local preview nhỏ có thể đổi góc, trạng thái mạng | Micro, loa, camera, đổi camera, kết thúc |
| Chia sẻ màn hình | Phiên video đang kết nối với chỉ báo đang chia sẻ rõ ràng và nút dừng luôn nhìn thấy | Bắt đầu/dừng MediaProjection, quay lại camera |

## Luồng người dùng trọng tâm

Người dùng đăng ký hoặc đăng nhập, sau đó mở **Danh bạ** để tìm một người theo tên. Khi lời mời được xác nhận, người dùng có thể vào cuộc trò chuyện 1:1. Header chat đặt ba nút tách biệt: **Gọi thoại**, **Gọi video** và **Chia sẻ màn hình**. Nút Chia sẻ màn hình khởi tạo một cuộc gọi video trước; chỉ sau khi hai bên đã kết nối, người khởi tạo mới nhận hộp thoại cấp quyền MediaProjection của Android và video camera được thay bằng luồng màn hình. Điều này ngăn chia sẻ màn hình khi không có người nhận.

Cuộc gọi thoại chỉ yêu cầu microphone khi người dùng gọi hoặc chấp nhận. Cuộc gọi video mới yêu cầu camera và microphone. Chia sẻ màn hình chỉ hiển thị xác nhận hệ thống khi người dùng chạm nút chia sẻ trong cuộc gọi video đã kết nối. Khi kết nối tạm rơi do chuyển Wi-Fi/4G, màn hình giữ trạng thái **Đang khôi phục kết nối**; logic signaling tạo ICE restart có giới hạn số lần và báo lỗi rõ ràng nếu không thể phục hồi.

| Trạng thái cuộc gọi | Thông điệp UI | Hành vi kỹ thuật |
| --- | --- | --- |
| Đang gọi/Đổ chuông | “Đang chờ phản hồi…” | Chờ offer/answer, timeout có kiểm soát |
| Đang kết nối | “Đang thiết lập kênh bảo mật” | Trao đổi ICE qua Socket.io, xếp hàng candidate trước remote description |
| Đã kết nối | Thời lượng `mm:ss` | Bắt đầu bộ đếm, cho phép điều khiển media |
| Mạng chập chờn | “Đang khôi phục kết nối…” | Gửi offer ICE restart, giữ media và signaling còn sống |
| Kết thúc/Lỗi | Nêu rõ người dùng có thể làm gì tiếp | Dừng track, đóng peer connection, giải phóng audio route và listener đúng một lần |

## Mô hình dữ liệu dùng chung

| Thực thể | Trường tối thiểu | Mục đích |
| --- | --- | --- |
| Người dùng | `id`, `username`, `displayName`, `passwordHash` | Xác thực và hiển thị danh bạ |
| Quan hệ bạn bè | `requesterId`, `recipientId`, `status` | Kiểm tra chỉ bạn bè đã xác nhận mới được gọi hoặc chat |
| Tin nhắn | `id`, `senderId`, `recipientId`, `body`, `createdAt` | Lưu lịch sử chat 1:1 có thẩm quyền ở server |
| Phiên gọi | `callId`, `callerId`, `calleeId`, `kind`, `status`, `startedAt`, `endedAt` | Phục vụ invite, kết thúc, lịch sử và trạng thái bận |
| Gói signaling | `callId`, `toUserId`, `description` hoặc `candidate`, `iceRestart` | Chỉ truyền offer, answer, ICE, hangup và screen-share state qua Socket.io |

## Mạng P2P và quyền riêng tư

Mọi `RTCPeerConnection` sử dụng cùng danh sách nhiều STUN Google và các TURN OpenRelay mà yêu cầu đã nêu. Server Socket.io chỉ xác thực người dùng, bảo toàn thứ tự signaling, chuyển tiếp offer/answer/candidate và ghi lịch sử; server không nhận luồng camera hoặc màn hình khi P2P trực tiếp thành công. TURN là relay kỹ thuật khi NAT/firewall cản P2P, vì vậy một dịch vụ OpenRelay công khai chỉ là phương án thử nghiệm không có cam kết về tính sẵn sàng hay bảo mật production.

> Mục tiêu “1000 km+” phụ thuộc đường truyền, NAT/firewall và chất lượng TURN chứ không thể được đảm bảo chỉ từ mã ứng dụng. Tiêu chí phát hành là kiểm thử trên ít nhất hai Android, có một lượt khác mạng Wi-Fi/4G, thay vì suy diễn từ giả lập hoặc build thành công.

## Màu sắc và thao tác

| Vai trò | Màu | Cách dùng |
| --- | --- | --- |
| Xanh Kết Nối | `#1577E8` | Nút chính, tab đang chọn, trạng thái hành động |
| Xanh đêm | `#081E37` | Bề mặt cuộc gọi, chữ đậm và nền video chờ |
| Nền sương | `#F4F7FB` | Danh sách, form và bề mặt nhẹ |
| Trắng | `#FFFFFF` | Thẻ, vùng soạn và bong bóng tin nhận |
| Xanh kết nối | `#19A974` | Online, cuộc gọi đã kết nối và nhận cuộc gọi |
| Đỏ kết thúc | `#E5484D` | Kết thúc/từ chối cuộc gọi và lỗi rõ ràng |

Điều khiển cuộc gọi dùng nền tối, nhãn ngắn bên dưới icon và phản hồi chạm nhẹ. Video remote luôn ưu tiên toàn màn hình; local preview là một khung nhỏ có viền rõ. Khi chia sẻ màn hình, nhãn “Bạn đang chia sẻ màn hình” luôn hiện cùng nút dừng để tránh chia sẻ nhầm kéo dài.
