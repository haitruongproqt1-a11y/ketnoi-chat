# Ghi chú ổn định khởi động Android

Trong quá trình đánh giá bản APK trước, thiết bị MIUI đã xác nhận crash ngay khi mở ứng dụng. Việc build thành công không được xem là bằng chứng ứng dụng mở được trên thiết bị thật.

## Nguồn kỹ thuật đã đối chiếu

- Reanimated 4 chỉ hỗ trợ React Native New Architecture. Ma trận chính thức xác nhận nhánh **4.1.x** tương thích React Native **0.81** và `react-native-worklets` **0.5.x**. [Compatibility table](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/)
- Reanimated **4.1.7** phát hành bản vá Android cho quá trình commit trong Android draw pass. [Reanimated 4.1.7 changelog](https://swmansion.com/changelog/reanimated-4-1-7/)
- Có báo cáo crash release trên thiết bị thật với Expo SDK 54, React Native 0.81 và Reanimated 4.1, trong đó build thành công nhưng ứng dụng crash ở splash trên thiết bị vật lý. [Issue #8235](https://github.com/software-mansion/react-native-reanimated/issues/8235)
- `react-native-webrtc` từng có các trường hợp crash lúc khởi động Android release; logcat là dữ liệu bắt buộc để xác định chính xác nguyên nhân trong từng ứng dụng. [Issue #780](https://github.com/react-native-webrtc/react-native-webrtc/issues/780)

## Quy tắc tái xây dựng

1. Không nạp hoặc gọi mô-đun WebRTC, media projection hay audio routing ở `RootLayout`; chỉ khởi tạo khi người dùng đi vào màn hình gọi.
2. Giữ `react-native-reanimated` và `react-native-worklets` ở cặp phiên bản tương thích với React Native 0.81.
3. Mọi APK signed phải được retest bằng một thiết bị Android vật lý trước khi được coi là bản sửa lỗi startup.
