const { withAndroidManifest, withMainApplication } = require("@expo/config-plugins");

const REQUIRED_PERMISSIONS = [
  "android.permission.CAMERA",
  "android.permission.RECORD_AUDIO",
  "android.permission.MODIFY_AUDIO_SETTINGS",
  "android.permission.ACCESS_NETWORK_STATE",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
  "android.permission.FOREGROUND_SERVICE_CAMERA",
  "android.permission.FOREGROUND_SERVICE_MICROPHONE",
];

module.exports = function withKetNoiAndroidPermissions(config) {
  const withPermissions = withAndroidManifest(config, (androidConfig) => {
    const manifest = androidConfig.modResults.manifest;
    const usesPermissions = manifest["uses-permission"] ?? [];
    const present = new Set(usesPermissions.map((permission) => permission.$?.["android:name"]));
    for (const permission of REQUIRED_PERMISSIONS) {
      if (!present.has(permission)) usesPermissions.push({ $: { "android:name": permission } });
    }
    manifest["uses-permission"] = usesPermissions;
    return androidConfig;
  });

  return withMainApplication(withPermissions, (androidConfig) => {
    const language = androidConfig.modResults.language;
    const isJava = language === "java";
    const importLine = isJava
      ? "import com.oney.WebRTCModule.WebRTCModuleOptions;"
      : "import com.oney.WebRTCModule.WebRTCModuleOptions";
    const statement = isJava
      ? "WebRTCModuleOptions.getInstance().enableMediaProjectionService = true;"
      : "WebRTCModuleOptions.getInstance().enableMediaProjectionService = true";
    let contents = androidConfig.modResults.contents;
    if (!contents.includes("WebRTCModuleOptions")) {
      contents = contents.replace(/^(package\s+[^\n]+\n)/m, `$1\n${importLine}\n`);
    }
    if (!contents.includes("enableMediaProjectionService = true")) {
      contents = isJava
        ? contents.replace(/super\.onCreate\(\);/, `super.onCreate();\n    ${statement}`)
        : contents.replace(/super\.onCreate\(\)/, `super.onCreate()\n    ${statement}`);
    }
    androidConfig.modResults.contents = contents;
    return androidConfig;
  });
};
