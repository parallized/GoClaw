import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import Unocss from "unocss/vite";

export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL("../../", import.meta.url));
  const env = loadEnv(mode, envDir, "");
  const apiPort = env.API_PORT || "6174";
  const webPort = Number(env.CORS_ORIGIN?.match(/:(\d+)/)?.[1] || "6173");
  const reactRoot = fileURLToPath(new URL("../../node_modules/react", import.meta.url));
  const reactDomRoot = fileURLToPath(new URL("../../node_modules/react-dom", import.meta.url));

  return {
    plugins: [react(), Unocss()],
    envDir,
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        "@goclaw/contracts": fileURLToPath(new URL("../../packages/contracts/src/index.ts", import.meta.url)),
        react: reactRoot,
        "react/jsx-runtime": fileURLToPath(new URL("../../node_modules/react/jsx-runtime.js", import.meta.url)),
        "react/jsx-dev-runtime": fileURLToPath(new URL("../../node_modules/react/jsx-dev-runtime.js", import.meta.url)),
        "react-dom": reactDomRoot,
        "react-dom/client": fileURLToPath(new URL("../../node_modules/react-dom/client.js", import.meta.url))
      }
    },
    optimizeDeps: {
      exclude: ["@iconify/react"],
      include: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"]
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
