# Kiến trúc realtime — Kết Nối

## Mục tiêu triển khai

Hệ thống gọi của Kết Nối dùng **WebRTC P2P** cho media giữa hai thiết bị. Máy chủ ứng dụng chỉ đảm nhận danh tính, phân phối báo hiệu, lưu trạng thái cuộc gọi và cấp cấu hình ICE thời hạn ngắn. Khi hai mạng không thể kết nối trực tiếp, media được relay qua cụm TURN; máy chủ ứng dụng không giải mã hay chuyển tiếp nội dung media.

## Thành phần và trách nhiệm

| Thành phần | Trách nhiệm | Dữ liệu không được lưu lâu dài |
| --- | --- | --- |
| Ứng dụng mobile | Thu âm/camera, tạo `RTCPeerConnection`, mã hóa DTLS-SRTP, hiển thị cuộc gọi và quyền chia sẻ màn hình | Offer/answer và ICE candidate sau khi cuộc gọi kết thúc |
| Dịch vụ báo hiệu | Chuyển offer, answer, ICE candidate và tín hiệu kết thúc giữa hai người dùng đã xác thực | SDP/candidate sau TTL ngắn |
| API Kết Nối | Xác thực, tạo phiên gọi, cấp danh sách ICE và ghi nhật ký cuộc gọi | TURN credential tĩnh |
| Cụm TURN | Dự phòng NAT traversal và relay media khi P2P trực tiếp không thành công | Media sau thời lượng phiên |
| Cơ sở dữ liệu | Hồ sơ, quan hệ liên hệ, hội thoại, metadata tin nhắn và nhật ký cuộc gọi | Video/audio thô và nội dung màn hình |

## Luồng cuộc gọi một-một

| Bước | Luồng |
| --- | --- |
| 1 | Người gọi tạo phiên `ringing`; API kiểm tra quyền, tạo `callId` và báo cho người nhận. |
| 2 | Cả hai ứng dụng xin cấu hình ICE ngắn hạn. Cấu hình chứa STUN và nhiều TURN theo vùng, với cả UDP, TCP và TLS. |
| 3 | Người gọi tạo offer; offer, answer và ICE candidate được gửi qua dịch vụ báo hiệu đã xác thực. |
| 4 | Hai peer kiểm tra đường trực tiếp trước. Nếu không khả dụng, ICE chọn TURN relay phù hợp; media vẫn đi bằng WebRTC. |
| 5 | Khi bắt đầu chia sẻ màn hình, peer thêm hoặc thay track màn hình vào cùng `RTCPeerConnection`; ứng dụng luôn hiển thị trạng thái đang chia sẻ và điều khiển dừng. |
| 6 | Khi kết thúc, hai peer đóng track/kết nối, dịch vụ báo hiệu xoá trạng thái tạm thời và API lưu nhật ký tối thiểu. |

## Chính sách TURN đa điểm

Thay vì đóng cứng thông tin đăng nhập, API `calls.iceConfig` sẽ cấp một tập TURN theo địa lý với thông tin xác thực có TTL 10 phút. Mỗi vùng cần có tối thiểu ba đường: `turn:` qua UDP 3478, `turn:` qua TCP 3478 và `turns:` qua TLS 5349. DNS định tuyến người dùng đến các vùng gần nhất; client nhận tối đa 6 endpoint tốt nhất cho một phiên để hạn chế thời gian ICE gathering nhưng vẫn có nhiều phương án dự phòng.

| Vùng đề xuất | Endpoint logical | Mục đích |
| --- | --- | --- |
| Đông Nam Á | `turn-ap-southeast` | Ưu tiên cho người dùng Việt Nam |
| Đông Á | `turn-ap-east` | Dự phòng khu vực châu Á |
| Châu Âu trung tâm | `turn-eu-central` | Tính sẵn sàng liên khu vực |
| Miền Tây Hoa Kỳ | `turn-us-west` | Dự phòng liên lục địa |

> TURN nhiều điểm giúp tăng khả năng kết nối, nhưng không nên gửi danh sách vô hạn cho mọi thiết bị. Cấp theo vùng và theo TTL ngắn vừa tăng độ bền kết nối, vừa giảm thời gian thu thập candidate và bảo vệ credential.

## Ràng buộc native của MVP

Thư viện React Native WebRTC có hỗ trợ audio/video và screen capture trên Android/iOS, nhưng là mô-đun native nên không chạy trong Expo Go. Ứng dụng cần development build và config plugin khi bước vào tích hợp media thật. [1] Trên Android, chia sẻ toàn màn hình cần cơ chế MediaProjection/foreground service; trên iOS, chia sẻ toàn màn hình cần Broadcast Upload Extension và App Group, còn in-app share là lựa chọn đơn giản hơn nhưng chỉ chia sẻ nội dung của chính ứng dụng. [2] [3]

## Cấu hình bảo mật trước khi chạy thật

Thông tin bí mật cần có là `TURN_SHARED_SECRET`, khoá ký credential TURN REST, URL dịch vụ báo hiệu và danh sách hostname TURN. Chúng chỉ nằm phía máy chủ. Ứng dụng mobile chỉ lấy payload ICE có TTL, qua route đã xác thực; tuyệt đối không đặt mật khẩu TURN dài hạn hoặc khóa vận hành trong `EXPO_PUBLIC_*`.

## Tham chiếu

[1]: https://github.com/react-native-webrtc/react-native-webrtc "React Native WebRTC — hỗ trợ nền tảng và giới hạn Expo Go"
[2]: https://getstream.io/video/docs/react-native/setup/installation/expo/ "Expo setup for React Native audio/video"
[3]: https://getstream.io/video/docs/react-native/guides/screensharing/react-native/ "React Native screen sharing setup"
