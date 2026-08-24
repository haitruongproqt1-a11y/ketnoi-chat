# Ghi nhận kỹ thuật cho cuộc gọi và chia sẻ màn hình

## Expo và WebRTC

`react-native-webrtc` cần mô-đun native, vì vậy chức năng gọi không thể chạy trong Expo Go thông thường. Ứng dụng cần Development Build cùng config plugin được khai báo trong cấu hình Expo. Nguồn: [Daily – Deploying WebRTC on an Expo React Native app](https://www.daily.co/blog/deploying-webrtc-on-an-expo-react-native-app-2/).

## Chia sẻ màn hình native

Trên Android, chia sẻ màn hình dựa trên MediaProjection phải được vận hành bằng foreground service; manifest cần có `FOREGROUND_SERVICE` và `FOREGROUND_SERVICE_MEDIA_PROJECTION` (cùng quyền thông báo để hiển thị foreground notification). Trên iOS, chia sẻ toàn bộ màn hình cần Broadcast Upload Extension dựa trên ReplayKit, nên không thể được bảo đảm chỉ bằng lớp JavaScript của Expo. Nguồn: [Stream – React Native screen sharing setup](https://getstream.io/video/docs/react-native/guides/screensharing/react-native/).

## Hệ quả áp dụng cho Kết Nối

Tính năng web có thể dùng WebRTC chuẩn của trình duyệt với `getUserMedia` và `getDisplayMedia`. Tính năng native cần giữ luồng `react-native-webrtc`, khai báo đủ quyền Android và xác định rõ giới hạn nền tảng; phần signaling phải được máy chủ Socket.IO phục vụ thay vì chỉ có client.
