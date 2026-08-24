/**
 * Web preview không có API Expo push native. Native implementation vẫn được
 * resolver chọn trên iOS/Android và thực hiện đăng ký Expo Push Token.
 */
export function NotificationBridge() {
  return null;
}
