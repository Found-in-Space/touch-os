import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        interaction: new URL("./interaction.html", import.meta.url).pathname,
        main: new URL("./index.html", import.meta.url).pathname,
        rendering: new URL("./render-fixture.html", import.meta.url).pathname
      }
    }
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: true
  }
});
