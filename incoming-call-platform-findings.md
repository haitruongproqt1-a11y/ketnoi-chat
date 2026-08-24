# Ghi nhận kỹ thuật cho nhận cuộc gọi nền

## CallKit và Android telecom

`react-native-callkeep` cung cấp lớp tích hợp CallKit trên iOS và ConnectionService trên Android. Thư viện chỉ hoạt động trên thiết bị thật, không hoạt động trên simulator; Android cần foreground service để duy trì âm thanh ở nền. Nguồn: [react-native-callkeep](https://github.com/react-native-webrtc/react-native-callkeep).

## Lựa chọn tương thích Expo

`expo-callkit-telecom` cung cấp config plugin cho Expo, dùng CallKit trên iOS và Core-Telecom trên Android. Tài liệu nêu rằng APNs VoIP/PushKit cho iOS và FCM data messages cho Android có thể được xử lý native trước khi JavaScript khởi động, giúp hiển thị cuộc gọi đến từ trạng thái đóng ứng dụng. Module yêu cầu iOS 15.1+ và Android API 26+. Nguồn: [expo-callkit-telecom](https://expo-callkit-telecom.mfairley.com/).

## Hệ quả thiết kế

Thông báo Expo thông thường có thể mở màn hình cuộc gọi khi người dùng chạm vào thông báo, nhưng không đủ để bảo đảm màn hình cuộc gọi hệ thống khi ứng dụng đã bị chấm dứt. Để có trải nghiệm đó cần cấu hình thông tin xác thực APNs VoIP, FCM và build native mới; thông báo thường vẫn được dùng như phương án dự phòng.
