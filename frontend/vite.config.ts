import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://localhost:3000",
      "/users": "http://localhost:3000",
      "/friends": "http://localhost:3000",
      "/discover": "http://localhost:3000",
      "/export": "http://localhost:3000",
      "/import": "http://localhost:3000",
      "/settings": "http://localhost:3000",
      "/qr": "http://localhost:3000",
      "/uploads": "http://localhost:3000",
    },
  },
  build: {
    target: "esnext",
    outDir: "dist",
  },
  resolve: {
    alias: {
      "~": "/src",
    },
  },
});
