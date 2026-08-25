# Triển khai Kết Nối

## Cấu hình môi trường

Ứng dụng Expo cần một API HTTPS công khai dùng cho REST và Socket.io. Đặt `EXPO_PUBLIC_API_URL` và `EXPO_PUBLIC_SOCKET_URL` trong secret manager của dự án hoặc trong môi trường shell phát triển, trỏ tới cùng domain backend. Không đóng gói địa chỉ `localhost`, `127.0.0.1` hoặc `10.0.2.2` vào APK phát hành.

Backend cần chạy sau proxy HTTPS hỗ trợ WebSocket, với CORS chỉ cho phép các origin web được tin cậy. Biến TURN phải đặt ở backend; không đặt `WEBRTC_TURN_CREDENTIAL` trong ứng dụng Expo. Nếu chưa có relay riêng, ứng dụng dùng OpenRelay như fallback thử nghiệm; cần thay bằng Coturn hoặc nhà cung cấp TURN có credential tạm thời trước khi vận hành thực tế.

## Build APK thủ công trên máy cá nhân

Trên máy có Node.js LTS, Android SDK và Java 17, chạy lần lượt:

```bash
git clone <your-repository-url> ketnoi-chat
cd ketnoi-chat
corepack enable
pnpm install --frozen-lockfile
export EXPO_PUBLIC_API_URL=https://api.example.com
export EXPO_PUBLIC_SOCKET_URL=https://api.example.com
npx expo-doctor
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

Profile `preview` trong `eas.json` tạo APK cài trực tiếp. Khi cần build trên máy cá nhân thay vì dịch vụ EAS, cài Android SDK/NDK theo Expo rồi chạy:

```bash
npx eas-cli build --platform android --profile preview --local
```

Lệnh local build tiêu tốn đáng kể CPU, RAM và dung lượng; chỉ chạy trên máy cá nhân có Android toolchain đầy đủ. Sau build EAS thành công, dashboard EAS hiển thị URL tải APK và mã QR cài đặt.

## APK tự động trên GitHub

Repository đã có workflow `.github/workflows/android-apk.yml`. Mỗi lần push vào nhánh `main` (hoặc chạy thủ công tại tab **Actions**) workflow sẽ cài dependencies, kiểm tra TypeScript, tạo Android native project bằng Expo prebuild và build `app-debug.apk`. APK debug có thể cài trực tiếp để kiểm thử nội bộ; không phải bản ký để phát hành lên Google Play.

Sau khi workflow chạy thành công, mở repository trên GitHub bằng đúng tài khoản được cấp quyền, vào **Actions** → **Android APK** → chọn lần chạy mới nhất → mục **Artifacts** → tải `ket-noi-debug-apk-<commit>`. Artifact được giữ trong 14 ngày. Vì repository đang ở chế độ private, GitHub yêu cầu đăng nhập đúng tài khoản có quyền trước khi xem trang hoặc tải APK.

Workflow không cần đưa token, file `.env`, TURN credential hoặc private signing key lên GitHub. Ứng dụng đang có endpoint HTTPS mặc định. Nếu cần thay endpoint ở từng bản build, đặt `EXPO_PUBLIC_API_URL` và `EXPO_PUBLIC_SOCKET_URL` dưới dạng **Repository variables**; không lưu chúng như credential bí mật.

## Checklist cloud

| Thành phần    | Yêu cầu                                                                           |
| ------------- | --------------------------------------------------------------------------------- |
| API/Socket.io | Domain HTTPS, WebSocket upgrade, health check và CORS giới hạn origin             |
| Database      | SQLite chỉ phù hợp thử nghiệm đơn node; dùng PostgreSQL/MySQL managed khi mở rộng |
| Tệp media     | Dùng object storage/S3 thay vì ổ đĩa tạm của container                            |
| TURN          | Coturn hoặc nhà cung cấp TURN, credential ngắn hạn, UDP/TCP/TLS                   |
| Biến bí mật   | Thiết lập bằng secret manager của nền tảng, không commit vào Git                  |

## Kiểm tra trước phát hành

```bash
pnpm check
cd ../ketnoi-web-chat/server && pnpm lint
```

Kiểm tra gọi audio/video và screen share trên hai thiết bị, bao gồm một thiết bị dùng mạng 4G/5G.
