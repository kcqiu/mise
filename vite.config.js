import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, "/");
          if (normalized.includes("node_modules")) {
            if (normalized.includes("@supabase")) {
              return "vendor-supabase";
            }
            if (normalized.includes("framer-motion")) {
              return "vendor-motion";
            }
            if (normalized.includes("lucide-react")) {
              return "vendor-icons";
            }
            if (normalized.includes("fuse.js")) {
              return "vendor-search";
            }
          }
          if (normalized.includes("src/recipes/components/RecipeEditor")) {
            return "recipe-editor";
          }
          if (normalized.includes("src/recipes/components/GroceryListView")) {
            return "grocery-view";
          }
          if (normalized.includes("src/recipes/components/AddRecipeModal")) {
            return "add-recipe-modal";
          }
        },
      },
    },
  },
});
