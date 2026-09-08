/**
 * 本地优先存储。
 *
 * localStorage 始终是事实来源：不登录、断网、甚至把单文件构建产物拷到 U 盘打开，
 * 功能都完整。云端同步是叠加在其上的备份层，而不是运行的前提。
 */

import { projectionInputSchema, type ProjectionInputDTO } from '@pmp/shared';

// v2：多地区改造后输入结构变了，旧存档无法通过 schema 校验，换 key 避免每次启动都白解析一遍
const KEY = 'pmp.input.v2';
const THEME_KEY = 'pmp.theme.v1';

export function loadLocalInput(): ProjectionInputDTO | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    // 校验而不是直接信任：旧版本存下的结构可能已经和当前 schema 不兼容
    const parsed = projectionInputSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveLocalInput(input: ProjectionInputDTO): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(input));
  } catch {
    // 隐私模式下 localStorage 会抛异常，静默降级为「本次会话有效」
  }
}

export type ThemePref = 'light' | 'dark' | 'system';

export function loadTheme(): ThemePref {
  const v = localStorage.getItem(THEME_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function saveTheme(t: ThemePref): void {
  try {
    if (t === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, t);
  } catch {
    /* 同上 */
  }
}

export function applyTheme(t: ThemePref): void {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
}
