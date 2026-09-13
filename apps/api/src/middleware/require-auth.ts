import type { MiddlewareHandler } from 'hono';
import { auth } from '../auth.js';
import type { AppEnv } from '../types.js';

/**
 * Validate the session and put the user on the context.
 *
 * Mounted on the scenario router itself rather than by path prefix in server.ts, so it's
 * impossible to forget authentication when adding a sub-route — the router is protected by
 * construction.
 *
 * 校验会话并把用户写入上下文。
 *
 * 挂在方案路由自身上（而不是 server.ts 里按路径前缀挂载），
 * 这样新增子路由时不可能忘记加鉴权——路由器本身就是受保护的。
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: '需要登录' }, 401);
  }
  c.set('user', {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });
  await next();
};
