# Kết Nối Mobile — development build và signaling

Ứng dụng Expo dùng `react-native-webrtc` cùng config plugin tương thích Expo SDK 54. Vì đây là mô-đun native, **Expo Go không thể chạy gọi audio/video**; cần tạo development build trước khi thử cuộc gọi thật.

## URL server cho mobile

| Biến | Vai trò |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | Base URL API Node.js, ví dụ `https://api.example.com` hoặc `http://192.168.1.20:3001` khi thử cùng Wi-Fi. |
| `EXPO_PUBLIC_SOCKET_URL` | Base URL Socket.io signaling; thường trùng API URL. |

Không đặt `JWT_SECRET`, TURN username hoặc TURN credential trong các biến `EXPO_PUBLIC_*`. Ứng dụng nhận ICE server từ endpoint `/api/webrtc/config` sau khi JWT được xác thực.

## Chạy native

Sao chép `.env.example` thành `.env`, thay hai URL theo máy chủ Node.js rồi tạo lại native project với config plugin. Có thể dùng `npx expo prebuild --clean` trước khi tạo development build; sau đó chạy native build trên thiết bị thật. iOS simulator không phù hợp để kiểm thử camera/micro; Android emulator chỉ phù hợp cho kiểm tra cơ bản. Cuộc gọi production cần HTTPS/WSS và TURN để dự phòng các mạng không kết nối P2P trực tiếp.
