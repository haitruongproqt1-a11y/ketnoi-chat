# Hướng dẫn tạo APK Development Build — Kết Nối

Tài liệu này dùng để tạo APK thử nghiệm trên điện thoại Android thật. Development build là lựa chọn cần thiết cho **WebRTC native** và **remote push notification**, hai tính năng không thể xác thực đầy đủ bằng Expo Go.

## 1. Chuẩn bị máy phát triển

Bạn cần Node.js LTS, tài khoản Expo và một thiết bị Android có thể cài APK. Tại thư mục gốc dự án, cài EAS CLI và đăng nhập:

```bash
npm install --global eas-cli
eas login
cd ketnoi-chat
pnpm install
```

## 2. Khởi tạo liên kết EAS và cấu hình backend

Chạy lệnh bên dưới một lần để liên kết dự án Expo với tài khoản Expo của bạn. Lệnh này sẽ tạo project ID, cần thiết để app lấy Expo push token:

```bash
eas build:configure
```

Sau đó, thiết lập URL **công khai HTTPS** của Node.js/Socket.io server. Không dùng `localhost` hoặc IP LAN khi tạo cloud build để cài trên thiết bị ở mạng khác.

```bash
eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value https://api.ten-mien-cua-ban.com
eas secret:create --scope project --name EXPO_PUBLIC_SOCKET_URL --value https://api.ten-mien-cua-ban.com
```

Server phải chạy Socket.io, hỗ trợ HTTPS/WSS, có endpoint `GET /health` trả về `{ "ok": true }`, và cấu hình `CLIENT_ORIGIN` phù hợp. Khi dùng push notification, cấu hình credentials Android/iOS theo luồng EAS khi CLI hỏi trong lần build đầu tiên.

## 3. Tạo APK development build

Profile `development` trong `eas.json` đã dùng `developmentClient: true`, `distribution: internal` và `buildType: apk`. Cấu hình Expo TypeScript (`app.config.ts`) là nguồn cấu hình chuẩn của dự án; khi EAS prebuild, plugin `with-ketnoi-android-permissions` đảm bảo AndroidManifest.xml có các quyền `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` và `ACCESS_NETWORK_STATE`.

> Không cần tự tạo hay sửa `app.json`/`android/AndroidManifest.xml` trong dự án managed Expo này. EAS sẽ sinh AndroidManifest từ `app.config.ts` và plugin trong quá trình build, nhờ đó quyền không bị mất sau lần prebuild kế tiếp.

Khi checkpoint đã sẵn sàng, tạo APK qua nút **Publish/Xuất bản** trong giao diện dự án. Hệ thống sẽ bắt đầu build và cung cấp APK tải về. Nếu dùng EAS CLI trên máy của bạn, chạy:

```bash
eas build --platform android --profile development
```

Khi build hoàn tất, EAS hiển thị một URL. Mở URL đó trên điện thoại Android, tải APK và cho phép cài từ nguồn này nếu hệ điều hành hỏi. Để chạy app trong lúc phát triển, kết nối điện thoại với cùng mạng Wi-Fi rồi dùng:

```bash
npx expo start --dev-client
```

Mở development build Kết Nối trên điện thoại và quét QR code/nhập URL dev server hiện ra trong terminal.

## 4. Tạo APK để gửi nội bộ

Khi muốn gửi cho người khác thử nghiệm mà không cần chạy Metro, dùng profile `preview`:

```bash
eas build --platform android --profile preview
```

Profile này cũng tạo file APK, có thể tải từ trang build EAS và cài trực tiếp. Production thường dùng AAB thay vì APK:

```bash
eas build --platform android --profile production
```

## 5. Kiểm thử chức năng thật

Tạo hai tài khoản bằng email khác nhau trên hai điện thoại hoặc hai development build. Gửi lời mời kết bạn, chấp nhận, nhắn tin, sau đó thử gọi video trên hai mạng khác nhau để xác nhận TURN fallback. Vào cài đặt hệ thống của điện thoại và bảo đảm quyền camera, micro, notification đã được cấp.

> Push token chỉ được lấy trên thiết bị thật có development build hoặc build phát hành. Expo Go không phù hợp để kiểm thử remote notification Android của SDK hiện tại.
