import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// 開發時 API 固定在 8787（npm run dev:api）；正式環境由同一個 Node 服務提供前端與 API
const API_PORT = process.env.API_PORT ?? '8787';

export default defineConfig({
  root: 'web',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./web/src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  server: {
    host: true, // 讓模擬器（10.0.2.2）與同網段手機連得到
    port: 5173,
    allowedHosts: true,
    fs: { allow: ['..'] },
    proxy: { '/api': `http://localhost:${API_PORT}` },
  },
  // Laya（onnxruntime-web）在 Web Worker 裡執行：Worker 用 ES module 才能 import；
  // onnxruntime-web 不要預先打包，否則它找不到自己的 .wasm
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
