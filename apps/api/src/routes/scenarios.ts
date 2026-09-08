/**
 * 方案的增删改查。
 *
 * 授权模型：没有数据库级 RLS，所有查询都必须带上 userId 条件。
 * 为避免遗漏，本文件里任何 prisma.scenario 调用都通过 `owned()` 构造 where 条件。
 */

import { Hono } from 'hono';
import { scenarioCreateSchema, scenarioUpdateSchema } from '@pmp/shared';
import { prisma } from '../db.js';
import { inputToScalars, rowToDTO } from '../mappers.js';
import { requireAuth } from '../middleware/require-auth.js';
import type { AppEnv } from '../types.js';

const scenarios = new Hono<AppEnv>();

// 整个路由器都要求登录，新增子路由不会漏掉鉴权
scenarios.use('*', requireAuth);

/** 所有权条件的唯一来源——任何按 id 定位方案的查询都必须经过它 */
const owned = (userId: string, id?: string) => (id ? { id, userId } : { userId });

const include = { salarySteps: true } as const;

scenarios.get('/', async (c) => {
  const user = c.get('user');
  const rows = await prisma.scenario.findMany({
    where: owned(user.id),
    include,
    orderBy: { updatedAt: 'desc' },
  });
  return c.json({ scenarios: rows.map(rowToDTO) });
});

scenarios.get('/:id', async (c) => {
  const user = c.get('user');
  const row = await prisma.scenario.findFirst({ where: owned(user.id, c.req.param('id')), include });
  if (!row) return c.json({ error: '方案不存在或无权访问' }, 404);
  return c.json({ scenario: rowToDTO(row) });
});

scenarios.post('/', async (c) => {
  const user = c.get('user');
  const parsed = scenarioCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: '参数校验失败', issues: parsed.error.issues }, 400);
  }
  const { name, note, input } = parsed.data;

  const duplicate = await prisma.scenario.findFirst({ where: { userId: user.id, name } });
  if (duplicate) return c.json({ error: `已存在同名方案「${name}」` }, 409);

  const row = await prisma.scenario.create({
    data: {
      ...inputToScalars(input),
      name,
      note: note ?? null,
      user: { connect: { id: user.id } },
      salarySteps: {
        create: input.income.salarySteps.map((s) => ({
          atYear: s.atYear,
          newMonthlySalary: s.newMonthlySalary,
        })),
      },
    },
    include,
  });
  return c.json({ scenario: rowToDTO(row) }, 201);
});

scenarios.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const parsed = scenarioUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: '参数校验失败', issues: parsed.error.issues }, 400);
  }
  const { name, note, input, expectedUpdatedAt } = parsed.data;

  const existing = await prisma.scenario.findFirst({ where: owned(user.id, id) });
  if (!existing) return c.json({ error: '方案不存在或无权访问' }, 404);

  // 乐观并发：另一台设备在本次编辑期间改过同一方案时，交还给客户端决定保留哪一份，
  // 而不是静默覆盖掉对方的修改。
  if (expectedUpdatedAt && existing.updatedAt.toISOString() !== expectedUpdatedAt) {
    const fresh = await prisma.scenario.findFirst({ where: owned(user.id, id), include });
    return c.json(
      { error: '该方案已在其他设备上被修改', conflict: true, current: fresh ? rowToDTO(fresh) : null },
      409,
    );
  }

  if (name && name !== existing.name) {
    const duplicate = await prisma.scenario.findFirst({ where: { userId: user.id, name } });
    if (duplicate) return c.json({ error: `已存在同名方案「${name}」` }, 409);
  }

  // salarySteps 是独立的表，整体替换比逐条 diff 更简单也更不容易出错，
  // 放在事务里保证不会出现「删掉了旧的、新的没写进去」的中间态。
  const row = await prisma.$transaction(async (tx) => {
    if (input) {
      await tx.salaryStep.deleteMany({ where: { scenarioId: id } });
    }
    return tx.scenario.update({
      where: { id },
      data: {
        ...(input ? inputToScalars(input) : {}),
        ...(name !== undefined ? { name } : {}),
        ...(note !== undefined ? { note: note ?? null } : {}),
        ...(input
          ? {
              salarySteps: {
                create: input.income.salarySteps.map((s) => ({
                  atYear: s.atYear,
                  newMonthlySalary: s.newMonthlySalary,
                })),
              },
            }
          : {}),
      },
      include,
    });
  });

  return c.json({ scenario: rowToDTO(row) });
});

scenarios.delete('/:id', async (c) => {
  const user = c.get('user');
  const result = await prisma.scenario.deleteMany({ where: owned(user.id, c.req.param('id')) });
  if (result.count === 0) return c.json({ error: '方案不存在或无权访问' }, 404);
  return c.body(null, 204);
});

export default scenarios;
