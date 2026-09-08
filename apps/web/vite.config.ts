import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 两种构建产物：
//   pnpm build              → 常规静态站点（含云端同步）
//   pnpm build:singlefile   → 单个 HTML 文件，双击即用、可离线，保留原型页面的便携性
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'singlefile' ? [viteSingleFile()] : [])],
  build: {
    outDir: mode === 'singlefile' ? 'dist-singlefile' : 'dist',
    target: 'es2022',
  },
  server: { port: 5173 },
}));
