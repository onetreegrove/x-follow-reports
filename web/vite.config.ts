import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787"
    }
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "server/**/*.test.ts"],
    passWithNoTests: true
  }
});
