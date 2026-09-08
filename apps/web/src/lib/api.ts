/** 方案 CRUD 的 fetch 封装。所有请求都带 cookie，401 时向上抛出便于回落到本地模式。 */

import type { ProjectionInputDTO, ScenarioDTO } from '@pmp/shared';
import { API_URL } from './auth-client.js';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
  get isConflict(): boolean {
    return this.status === 409;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error ?? `请求失败（${res.status}）`;
    throw new ApiError(res.status, message, body);
  }
  return body as T;
}

export const scenarioApi = {
  list: () => request<{ scenarios: ScenarioDTO[] }>('/api/scenarios').then((r) => r.scenarios),

  create: (name: string, input: ProjectionInputDTO, note?: string) =>
    request<{ scenario: ScenarioDTO }>('/api/scenarios', {
      method: 'POST',
      body: JSON.stringify({ name, input, note }),
    }).then((r) => r.scenario),

  update: (id: string, patch: { name?: string; note?: string; input?: ProjectionInputDTO; expectedUpdatedAt?: string }) =>
    request<{ scenario: ScenarioDTO }>(`/api/scenarios/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }).then((r) => r.scenario),

  remove: (id: string) => request<void>(`/api/scenarios/${id}`, { method: 'DELETE' }),
};
