import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: "./vitest.setup.ts",
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      clearMocks: true,
      restoreMocks: true
    }
  })
);
