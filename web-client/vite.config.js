import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import topLevelAwait from "vite-plugin-top-level-await";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), topLevelAwait()],
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    alias: {
      "@core": path.resolve(__dirname, "../core"),
      "@data": path.resolve(__dirname, "../data"),
    },
  },
  define: {
    "process.env": {},
  },
  optimizeDeps: {
    exclude: ["dotenv"],
  },
});
