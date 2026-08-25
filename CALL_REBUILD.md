# Kế hoạch tái thiết kế cuộc gọi Kết Nối

## Phạm vi khóa

Việc tái thiết kế chỉ tác động tới cuộc gọi thoại, gọi video, chia sẻ màn hình Android và signaling WebRTC hỗ trợ ba luồng đó. Các module chat, xác thực, danh bạ, tin nhắn, tệp đính kèm, database, notification và lịch sử cuộc gọi phải tiếp tục giữ hợp đồng dữ liệu hiện có.

## Hiện trạng đã lập bản đồ

| Bề mặt | Tệp hiện tại | Nhận định |
|---|---|---|
| Màn hình Android | `app/call.native.tsx` | Gộp UI, lấy media, peer connection, signaling, CallKeep, audio routing và screen share vào một component. Điều này tạo nhiều đường dọn dẹp cạnh tranh và làm mất candidate khi route/signal đến lệch thời điểm. |
| Signaling mobile | `lib/socket-context.tsx` | Chỉ giữ `latestSignal`, vì vậy nhiều ICE candidate liên tiếp có thể bị ghi đè trước khi màn hình gọi xử lý. |
| Signaling/backend | `server/mobile-call-service.ts` | Có xác thực Socket.io, kiểm tra quan hệ bạn bè, lưu lời mời và lịch sử cuộc gọi. Các side effect chat/lịch sử cần được giữ. |
| Android native | `plugins/with-ketnoi-android-permissions.cjs` | Trộn quyền WebRTC/MediaProjection với CallKeep/Telecom. CallKeep sẽ được tách khỏi call flow mới. |
| ICE | `GET /api/webrtc/config` | Hợp đồng trả về `iceServers` được giữ; OpenRelay chỉ là fallback thử nghiệm, không phải TURN production. |

## Hợp đồng signaling thay thế

Các event Socket.io vẫn giữ tên để không phá backend và notification hiện có: `call:offer`, `call:answer`, `call:ice-candidate`, `call:hangup`, `call:screen-share`, `call:error`.

Mỗi payload bắt buộc có `callId`, `toUserId` hoặc `fromUserId` phù hợp. Client mới phải xếp hàng candidate theo `callId` cho tới khi remote description tồn tại; không sử dụng một biến `latestSignal` làm hàng đợi. Mọi call session phải gửi `call:hangup` khi người dùng kết thúc hoặc timeout, sau đó giải phóng peer connection, tracks, timers, audio route và listener riêng của session.

## Thứ tự triển khai

1. Tách signaling mailbox/session ra khỏi giao diện và thay thế voice call trước.
2. Thêm video vào cùng session đã ổn định, không tạo một flow signaling riêng.
3. Thêm screen share Android qua MediaProjection/getDisplayMedia, thay camera video sender bằng display track và khôi phục camera track khi dừng.
4. Chạy unit/integration tests cho signaling, TypeScript, regression chat/backend và build APK signed. Kiểm thử audio/video/screen-share hai thiết bị phải được thực hiện trên Android thật; build thành công không được coi là bằng chứng media hoạt động.
