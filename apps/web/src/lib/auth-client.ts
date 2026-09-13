import { createAuthClient } from 'better-auth/react';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

/**
 * Better Auth's React client. The session travels in an httpOnly cookie, so every request must
 * send credentials or the sign-in state never makes it across.
 *
 * Better Auth 的 React 客户端。会话走 httpOnly cookie，
 * 所以每个请求都必须带 credentials，否则登录状态传不过去。
 */
export const authClient = createAuthClient({
  baseURL: `${API_URL}/api/auth`,
  fetchOptions: { credentials: 'include' },
});

export const { signIn, signUp, signOut, useSession } = authClient;
export { API_URL };
