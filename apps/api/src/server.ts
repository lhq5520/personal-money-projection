import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { auth } from './auth.js';
import { env } from './env.js';
import { prisma } from './db.js';
import scenarios from './routes/scenarios.js';
import type { AppEnv } from './types.js';

const app = new Hono<AppEnv>();

app.use('*', logger());

// credentials: true 是必须的——Better Auth 用 cookie 维持会话，
// 跨端口请求不带凭据的话登录状态永远传不过去。
app.use(
  '*',
  cors({
    origin: env.webOrigin,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  }),
);

app.get('/health', async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ ok: true, db: 'up' });
  } catch {
    return c.json({ ok: false, db: 'down' }, 503);
  }
});

// Better Auth 自带全部认证端点（注册/登录/登出/会话），整体挂载即可
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

// 鉴权由 scenarios 路由器内部的 requireAuth 负责，见 routes/scenarios.ts
app.route('/api/scenarios', scenarios);

app.onError((err, c) => {
  console.error('[api] 未捕获的错误:', err);
  // 不把内部错误信息回传给客户端，避免泄露表结构等实现细节
  return c.json({ error: '服务器内部错误' }, 500);
});

app.notFound((c) => c.json({ error: '接口不存在' }, 404));

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`[api] 已启动 http://localhost:${info.port}`);
  console.log(`[api] 允许的前端来源: ${env.webOrigin}`);
});

export default app;
