import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The dashboard only talks to the Vigilance FastAPI backend. In development
// Vite proxies /api to it, so the browser stays same-origin and no secret
// or Wazuh/agents URL ever reaches the frontend.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const target = env.VIGILANCE_API_URL || "http://127.0.0.1:8000";
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: { "/api": { target, changeOrigin: true } },
    },
    preview: {
      port: 4173,
      proxy: { "/api": { target, changeOrigin: true } },
    },
  };
});
