import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './db.js';
import { env } from './env.js';

/**
 * Better Auth 配置。
 *
 * 用户表由 Better Auth 通过 Prisma adapter 管理，schema 里的
 * user / session / account / verification 四张表就是它要求的形状。
 * 密码由 Better Auth 负责哈希，本项目任何地方都不接触明文密码。
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  secret: env.authSecret,
  baseURL: env.authUrl,
  emailAndPassword: {
    enabled: true,
    // 开发阶段不强制验证邮箱；上线前应接入邮件服务并改为 true
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 天
    updateAge: 60 * 60 * 24, // 每天最多续期一次
  },
  advanced: {
    // 前后端跨端口（5173 → 8787），cookie 必须显式放宽 SameSite 才能带上
    defaultCookieAttributes: env.isProd
      ? { sameSite: 'lax', secure: true }
      : { sameSite: 'lax', secure: false },
  },
  trustedOrigins: [env.webOrigin],
});

export type AuthSession = typeof auth.$Infer.Session;
