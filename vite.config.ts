import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "sites-static-worker",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "server/index.js",
          source:
            "export default { async fetch(request, env) { return env.ASSETS.fetch(request); } };\n",
        });
      },
    },
  ],
  base: "./",
  worker: {
    format: "es",
  },
});
