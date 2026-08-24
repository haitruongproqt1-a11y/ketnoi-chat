const { withAndroidManifest, withInfoPlist, withMainActivity, withMainApplication } = require("@expo/config-plugins");

const REQUIRED_PERMISSIONS = [
  "android.permission.CAMERA",
  "android.permission.RECORD_AUDIO",
  "android.permission.MODIFY_AUDIO_SETTINGS",
  "android.permission.ACCESS_NETWORK_STATE",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
  "android.permission.FOREGROUND_SERVICE_CAMERA",
  "android.permission.FOREGROUND_SERVICE_MICROPHONE",
  "android.permission.READ_PHONE_STATE",
  "android.permission.CALL_PHONE",
  "android.permission.BIND_TELECOM_CONNECTION_SERVICE",
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
    const application = manifest.application?.[0];
    if (application) {
      const services = application.service ?? [];
      const hasVoiceConnection = services.some((service) => service.$?.["android:name"] === "io.wazo.callkeep.VoiceConnectionService");
      if (!hasVoiceConnection) {
        services.push({
          $: {
            "android:name": "io.wazo.callkeep.VoiceConnectionService",
            "android:label": "Kết Nối",
            "android:permission": "android.permission.BIND_TELECOM_CONNECTION_SERVICE",
            "android:exported": "true",
            "android:foregroundServiceType": "camera|microphone",
          },
          "intent-filter": [{ action: [{ $: { "android:name": "android.telecom.ConnectionService" } }] }],
        });
      }
      const hasBackgroundService = services.some((service) => service.$?.["android:name"] === "io.wazo.callkeep.RNCallKeepBackgroundMessagingService");
      if (!hasBackgroundService) services.push({ $: { "android:name": "io.wazo.callkeep.RNCallKeepBackgroundMessagingService" } });
      application.service = services;
    }
    return androidConfig;
  });

  const withCallKeepBackgroundModes = withInfoPlist(withPermissions, (iosConfig) => {
    const currentModes = Array.isArray(iosConfig.modResults.UIBackgroundModes) ? iosConfig.modResults.UIBackgroundModes : [];
    iosConfig.modResults.UIBackgroundModes = [...new Set([...currentModes, "audio", "voip", "remote-notification"])];
    return iosConfig;
  });

  const withCallKeepPermissionCallback = withMainActivity(withCallKeepBackgroundModes, (androidConfig) => {
    const isJava = androidConfig.modResults.language === "java";
    let contents = androidConfig.modResults.contents;
    const importLine = isJava ? "import io.wazo.callkeep.RNCallKeepModule;" : "import io.wazo.callkeep.RNCallKeepModule";
    if (!contents.includes("RNCallKeepModule")) {
      contents = contents.replace(/^(package\s+[^\n]+\n)/m, `$1\n${importLine}\n`);
    }
    if (!contents.includes("RNCallKeepModule.onRequestPermissionsResult")) {
      const callback = isJava
        ? `\n  @Override\n  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {\n    super.onRequestPermissionsResult(requestCode, permissions, grantResults);\n    if (requestCode == RNCallKeepModule.REQUEST_READ_PHONE_STATE) {\n      RNCallKeepModule.onRequestPermissionsResult(requestCode, permissions, grantResults);\n    }\n  }\n`
        : `\n  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {\n    super.onRequestPermissionsResult(requestCode, permissions, grantResults)\n    if (requestCode == RNCallKeepModule.REQUEST_READ_PHONE_STATE) {\n      RNCallKeepModule.onRequestPermissionsResult(requestCode, permissions, grantResults)\n    }\n  }\n`;
      contents = contents.replace(/\n}\s*$/, `${callback}}\n`);
    }
    androidConfig.modResults.contents = contents;
    return androidConfig;
  });

  return withMainApplication(withCallKeepPermissionCallback, (androidConfig) => {
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
