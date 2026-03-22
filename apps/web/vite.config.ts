import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import Unocss from "unocss/vite";

export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL("../../", import.meta.url));
  const env = loadEnv(mode, envDir, "");
  const apiPort = env.API_PORT || "6174";
  const webPort = Number(env.CORS_ORIGIN?.match(/:(\d+)/)?.[1] || "6173");

  return {
    plugins: [react(), Unocss()],
    envDir,
    resolve: {
      alias: {
        "@goplan/contracts": fileURLToPath(new URL("../../packages/contracts/src/index.ts", import.meta.url))
      }
    },
    server: {
      port: webPort,
      proxy: {
        "/api": {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true
        }
      }
    }
  };
});
