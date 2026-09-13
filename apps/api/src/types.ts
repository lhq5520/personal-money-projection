/**
 * Variable types on the Hono context. Once the requireAuth middleware passes, `user` is
 * guaranteed to be present.
 *
 * Hono 上下文的变量类型。requireAuth 中间件通过后，`user` 一定存在。
 */
export interface AppEnv {
  Variables: {
    user: { id: string; email: string; name: string };
  };
}
