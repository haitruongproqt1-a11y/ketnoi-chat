const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);
// Chỉ theo dõi project Expo hiện tại. Không quét các workspace/backend lân cận,
// vốn làm haste-map lớn và khiến Metro hết bộ nhớ khi bundle web.
config.watchFolders = [];

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules
  // This fixes iOS styling issues in development mode
  forceWriteFileSystem: true,
});
