import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { getViteConfig } from "vitest/config";

// @sabaki/shudan is a Preact component that the package author also supports
// against React by aliasing `preact` → `react` (see the package's own
// demo-react build). React exports `createElement`, `Component`, and
// `useCallback` at the top level, matching what shudan imports.
const backendHttp = process.env.VITE_API_URL ?? "http://localhost:8000";
const backendWs = backendHttp.replace(/^http/, "ws");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^preact\/hooks$/, replacement: "react" },
      { find: /^preact$/, replacement: "react" },
    ],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": backendHttp,
      "/ws": { target: backendWs, ws: true },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/tests/profile/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "node_modules",
        "src/**/*.d.ts",
        "src/**/*.test.{ts,tsx}",
        "src/**/*.spec.{ts,tsx}",
      ],
    },
  },
});
