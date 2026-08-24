const { withAndroidManifest } = require("@expo/config-plugins");

const REQUIRED_PERMISSIONS = [
  "android.permission.CAMERA",
  "android.permission.RECORD_AUDIO",
  "android.permission.MODIFY_AUDIO_SETTINGS",
  "android.permission.ACCESS_NETWORK_STATE",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
];

module.exports = function withKetNoiAndroidPermissions(config) {
  return withAndroidManifest(config, (androidConfig) => {
    const manifest = androidConfig.modResults.manifest;
    const usesPermissions = manifest["uses-permission"] ?? [];
    const present = new Set(usesPermissions.map((permission) => permission.$?.["android:name"]));
    for (const permission of REQUIRED_PERMISSIONS) {
      if (!present.has(permission)) usesPermissions.push({ $: { "android:name": permission } });
    }
    manifest["uses-permission"] = usesPermissions;
    return androidConfig;
  });
};
