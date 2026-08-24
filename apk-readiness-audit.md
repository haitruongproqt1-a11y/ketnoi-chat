# APK Readiness Audit

## Phạm vi

Rà soát trước khi tạo APK tập trung vào CallKeep/ConnectionService, quyền native Android/iOS, WebRTC, TURN/ICE, Socket.IO signaling, chia sẻ màn hình và các kiểm thử build-ready.

## Tiêu chí chấp nhận

- Cấu hình Expo prebuild phải phân giải toàn bộ plugin native và quyền yêu cầu.
- Mã TypeScript, bộ kiểm thử hồi quy và kiểm thử signaling phải hoàn tất không lỗi.
- Endpoint TURN/ICE và backend HTTPS phải phản hồi hợp lệ.
- Mọi phát hiện ảnh hưởng việc build hoặc nhận/gọi media phải được sửa trước khi bàn giao.

## Yêu cầu native cần đối chiếu

- Cuộc gọi video cần quyền camera và microphone được khai báo trong binary, đồng thời luồng media phải giải phóng khi cuộc gọi kết thúc.
- Chia sẻ màn hình WebRTC dùng cơ chế MediaProjection native; cấu hình foreground service và quyền liên quan cần được kiểm tra trong Android manifest được sinh bởi Expo prebuild.
- Bản build native phải dùng plugin cấu hình phù hợp; Expo Go không bao gồm CallKeep hay react-native-webrtc cho luồng cuộc gọi hệ thống.

## Phát hiện cấu hình ban đầu

- Cấu hình Expo đã khai báo plugin WebRTC, thông báo, plugin Android tùy chỉnh và các quyền media cơ bản.
- Plugin Android đang tự chèn foreground service cho MediaProjection và ConnectionService của CallKeep, đồng thời thêm callback xin quyền vào MainActivity.
- Cần xác minh cấu trúc Android manifest được sinh thực tế và tên lớp dịch vụ CallKeep có tồn tại trong phiên bản package đã cài, vì sai lớp native sẽ làm APK lỗi ngay khi cài hoặc khởi chạy.

## Phát hiện CallKeep

- Package `react-native-callkeep` 4.3.16 và `react-native-webrtc` 124.0.8 đều hiện diện; các lớp `VoiceConnectionService` và `RNCallKeepBackgroundMessagingService` được plugin tham chiếu cũng tồn tại.
- Cần chuẩn hóa định danh truyền vào CallKeep theo UUID hệ thống, đồng thời giữ nguyên call ID báo hiệu của ứng dụng. Đây là điểm cần sửa trước khi build để tránh lỗi nền tảng khi hiển thị cuộc gọi hệ thống.

## Phát hiện vòng đời cuộc gọi

- Màn hình native quản lý đúng các luồng camera/microphone, ICE candidate, trạng thái kết nối và thay thế video track khi chia sẻ màn hình.
- Call ID báo hiệu hiện được tạo theo timestamp, trong khi CallKeep cần system UUID; cầu nối CallKeep cũng cần nhất quán ánh xạ system UUID với call ID báo hiệu khi trả lời hoặc kết thúc.
- Luồng gọi đi nên chờ CallKeep hoàn tất khởi tạo trước khi gọi API hệ thống để tránh lỗi thời điểm khởi động native module.

## Cập nhật sau rà soát

- Đã thêm ánh xạ ổn định từ call ID báo hiệu sang UUID hợp lệ cho CallKeep, cập nhật bridge theo system UUID và giới hạn thao tác mute CallKeep ở iOS theo API của package.
- Cấu hình WebRTC native yêu cầu tối thiểu một STUN/TURN URL, dùng bundle/RTCP mux phù hợp và nhận danh sách ICE từ backend đã xác thực.

## Phát hiện backend và build profile

- Profile `development` và `preview` đều tạo APK nội bộ; development profile phù hợp nhất để kiểm thử CallKeep và WebRTC native.
- Endpoint ICE chỉ trả TURN có xác thực khi đủ biến môi trường; nếu chưa có TURN riêng, backend cung cấp fallback relay có credential thời hạn.
- Signaling Socket.IO lưu offer, gửi push khi người nhận offline và cho phép ứng dụng lấy lại offer có bảo vệ qua call ID; luồng này phù hợp với trả lời từ thông báo.

## Phát hiện API và signaling mobile

- Ứng dụng native mặc định trỏ tới HTTPS backend công khai khi không có biến môi trường ghi đè; Socket.IO dùng cùng origin, phù hợp với APK cài trên thiết bị thật.
- Hợp đồng signaling hiện bao phủ offer, answer, ICE candidate, hangup và chia sẻ màn hình. Cần bổ sung xử lý `call:error` từ backend trong context/màn hình gọi để báo lỗi thao tác thay vì chỉ chờ trạng thái kết nối.
- Đã bổ sung `call:error` vào hợp đồng Socket.IO và màn hình gọi web/native; khi backend từ chối signaling, ứng dụng giải phóng peer/media rồi hiển thị lỗi thay vì treo camera hoặc microphone.

## Phát hiện prebuild Android

- Prebuild đã hoàn tất và sinh được MainActivity Kotlin với callback quyền CallKeep đúng cú pháp.
- Đã phát hiện `VoiceConnectionService` có intent-filter nhưng thiếu thuộc tính `android:exported`; plugin đã được sửa để sinh `android:exported="true"`, đáp ứng yêu cầu Android 12+ khi đóng gói APK.
- Prebuild chạy lại xác nhận ConnectionService hiện có `android:exported="true"`; manifest của react-native-webrtc cũng đăng ký `MediaProjectionService` với foreground type `mediaProjection`, phù hợp luồng chia sẻ màn hình Android.
- MainApplication sinh từ prebuild bật `WebRTCModuleOptions.enableMediaProjectionService`; kiểm tra TypeScript mới hoàn tất không lỗi sau khi bổ sung xử lý `call:error`.
- Kiểm thử UUID CallKeep ban đầu không thể tải native module trong Vitest; phép biến đổi UUID đã được tách thành mô-đun TypeScript thuần để kiểm tra đơn vị độc lập với runtime React Native.
- Đã tuần tự hóa việc khởi tạo CallKeep và buộc luồng gọi đến/gọi đi chờ native setup hoàn tất trước khi hiển thị UI hệ thống, tránh lỗi race condition ngay sau khi mở ứng dụng.
- Đã áp dụng cùng nguyên tắc khởi tạo CallKeep cho thông báo foreground và chặn hiển thị trùng một call ID khi Socket.IO cùng push notification đến gần đồng thời.
- Lint toàn dự án phát hiện một React Hook bị gọi có điều kiện trong bong bóng chat; đã chuyển tạo PanResponder lên trước mọi nhánh render, không thay đổi hành vi chat nhưng loại bỏ lỗi có thể làm app crash ở runtime.
