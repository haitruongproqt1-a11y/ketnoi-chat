import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(__dirname, "..");

function source(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("Android startup boundary", () => {
  it("does not initialize notification or compressor native modules from the root app", () => {
    const rootLayout = source("app/_layout.tsx");
    const appConfig = source("app.config.ts");
    const packageJson = source("package.json");

    expect(rootLayout).not.toContain("NotificationBridge");
    expect(appConfig).not.toContain("react-native-compressor");
    expect(appConfig).not.toContain('"expo-notifications"');
    expect(packageJson).not.toContain('"react-native-compressor"');
    expect(packageJson).not.toContain('"expo-notifications"');
  });
});
