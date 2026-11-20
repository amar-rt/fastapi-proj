import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Local dev: run the API with `uvicorn --app-dir api _app.main:app --port 8000`
    proxy: { "/api": "http://localhost:8000" },
  },
});
