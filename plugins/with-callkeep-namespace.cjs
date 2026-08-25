const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

/**
 * react-native-callkeep 4.x vẫn dùng Android library Gradle file cũ, không
 * khai báo `namespace`. Android Gradle Plugin 8+ (Expo SDK 54) yêu cầu trường
 * này ngay cả khi manifest đã có package name, nên EAS sẽ dừng tại Gradle.
 */
module.exports = function withCallKeepNamespace(config) {
  return withDangerousMod(config, ["android", async (androidConfig) => {
    const gradlePath = path.join(androidConfig.modRequest.projectRoot, "node_modules", "react-native-callkeep", "android", "build.gradle");
    if (!fs.existsSync(gradlePath)) return androidConfig;
    const source = fs.readFileSync(gradlePath, "utf8");
    if (/\bnamespace\s+["']io\.wazo\.callkeep["']/.test(source)) return androidConfig;
    const patched = source.replace(/android\s*\{\s*/, (match) => `${match}    namespace "io.wazo.callkeep"\n`);
    if (patched === source) throw new Error("Không thể thêm namespace Android cho react-native-callkeep.");
    fs.writeFileSync(gradlePath, patched);
    return androidConfig;
  }]);
};
