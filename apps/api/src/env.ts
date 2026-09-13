/**
 * Centralized reading and validation of environment variables.
 *
 * Better to crash at process start over missing configuration than to return a 500 the moment a
 * user clicks "sign in".
 *
 * 环境变量集中读取与校验。
 *
 * 宁可在进程启动时因为缺少配置而立刻崩溃，也不要等到用户点了登录按钮才 500。
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`缺少必需的环境变量 ${name}，请参照仓库根目录的 .env.example 配置`);
  }
  return v;
}

const isProd = process.env.NODE_ENV === 'production';

export const env = {
  isProd,
  databaseUrl: required('DATABASE_URL'),
  port: Number(process.env.API_PORT ?? 8787),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  authSecret: required('BETTER_AUTH_SECRET'),
  authUrl: process.env.BETTER_AUTH_URL ?? 'http://localhost:8787',
};

if (isProd && env.authSecret.includes('dev-only')) {
  throw new Error('生产环境仍在使用示例用的 BETTER_AUTH_SECRET，请用 `openssl rand -base64 32` 重新生成');
}
