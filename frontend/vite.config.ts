import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @sabaki/shudan is a Preact component that the package author also supports
// against React by aliasing `preact` → `react` (see the package's own
// demo-react build). React exports `createElement`, `Component`, and
// `useCallback` at the top level, matching what shudan imports.
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
      "/api": "http://localhost:8000",
      "/ws": { target: "ws://localhost:8000", ws: true },
    },
  },
});
