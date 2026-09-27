/**
 * Local development entry point.
 *
 * Starts a long-lived Node HTTP server on API_PORT. Production does not use this file at all —
 * there the app is driven by a Vercel Function (see api/[...route].ts at the repo root), which
 * hands each request straight to `app.fetch`.
 *
 * 本地开发入口。
 *
 * 在 API_PORT 上启动一个常驻的 Node HTTP 服务。生产环境完全不走这个文件——
 * 那边由 Vercel Function 驱动（见仓库根目录的 api/[...route].ts），
 * 它把每个请求直接交给 `app.fetch`。
 */

import { serve } from '@hono/node-server';
import app from './app.js';
import { env } from './env.js';

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`[api] 已启动 http://localhost:${info.port}`);
  console.log(`[api] 允许的前端来源: ${env.webOrigin}`);
});
