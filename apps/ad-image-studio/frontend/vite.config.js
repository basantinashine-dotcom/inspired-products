import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Supabase sends sign-in links back to its Site URL, which is
  // http://localhost:3000 in a new project. Fail loudly rather than drift to
  // another port where those links would not land.
  server: { port: 3000, strictPort: true },
});
