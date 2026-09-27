/**
 * The Hono application — routes and middleware only, no listening.
 *
 * Deliberately free of any `serve()` call so the same app can be driven by two very different
 * hosts: a long-lived Node server locally (see server.ts) and a Vercel Function in production
 * (see api/[...route].ts at the repo root). A top-level `serve()` here would start a socket the
 * moment anything imported this module, which is fatal in a serverless runtime.
 *
 * Hono 应用本体——只有路由和中间件，不负责监听。
 *
 * 刻意不含任何 `serve()` 调用，这样同一个 app 可以被两种宿主驱动：
 * 本地的常驻 Node 服务（见 server.ts），和生产环境的 Vercel Function
 * （见仓库根目录的 api/[...route].ts）。若在此处顶层调用 `serve()`，
 * 任何 import 都会立刻打开一个套接字，这在 serverless 运行时是致命的。
 */

import { Hono } from 'hono';
import type { Handler } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { auth } from './auth.js';
import { env } from './env.js';
import { prisma } from './db.js';
import scenarios from './routes/scenarios.js';
import type { AppEnv } from './types.js';

const app = new Hono<AppEnv>();

app.use('*', logger());

// credentials: true is required — Better Auth keeps the session in a cookie, and a cross-port
// request without credentials would never carry the sign-in state across.
// Deployed on Vercel the frontend and API share an origin, making this a no-op there; it is what
// keeps local development (5173 → 8787) working.
// credentials: true 是必须的——Better Auth 用 cookie 维持会话，
// 跨端口请求不带凭据的话登录状态永远传不过去。
// 部署到 Vercel 后前后端同源，这里实际不起作用；它保的是本地开发（5173 → 8787）。
app.use(
  '*',
  cors({
    origin: env.webOrigin,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  }),
);

const health: Handler<AppEnv> = async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ ok: true, db: 'up' });
  } catch {
    return c.json({ ok: false, db: 'down' }, 503);
  }
};

// Registered under both paths on purpose: on Vercel only /api/* is routed to the function, so a
// bare /health would be answered by the CDN with a 404 for a missing static file.
// 故意注册在两个路径下：Vercel 上只有 /api/* 会路由到函数，
// 裸的 /health 会被 CDN 当作缺失的静态文件返回 404。
app.get('/health', health);
app.get('/api/health', health);

// Better Auth ships every auth endpoint (sign-up / sign-in / sign-out / session), so mounting it
// wholesale is enough.
// Better Auth 自带全部认证端点（注册/登录/登出/会话），整体挂载即可
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

// Authentication is handled by requireAuth inside the scenarios router; see routes/scenarios.ts.
// 鉴权由 scenarios 路由器内部的 requireAuth 负责，见 routes/scenarios.ts
app.route('/api/scenarios', scenarios);

app.onError((err, c) => {
  console.error('[api] 未捕获的错误:', err);
  // Don't return internal error details to the client — that would leak implementation details
  // like the table structure.
  // 不把内部错误信息回传给客户端，避免泄露表结构等实现细节
  return c.json({ error: '服务器内部错误' }, 500);
});

app.notFound((c) => c.json({ error: '接口不存在' }, 404));

export default app;
