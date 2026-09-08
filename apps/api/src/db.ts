import { PrismaClient } from '@prisma/client';

/**
 * Prisma 客户端单例。
 *
 * tsx watch 每次热重载都会重新求值模块，若不挂到 globalThis 上，
 * 开发时会不断累积连接，很快耗尽 Postgres 的连接数。
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
