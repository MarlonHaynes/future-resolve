import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// Dev-server proxy so the frontend can call /api/* without CORS/env
// juggling in local development. In production, VITE_API_URL is used
// directly (see src/api/client.ts).
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            "/api": {
                target: process.env.VITE_API_URL || "http://localhost:4000",
                changeOrigin: true,
            },
        },
    },
});
