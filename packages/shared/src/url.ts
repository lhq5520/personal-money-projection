/**
 * Encode scenario parameters into a URL, so sharing needs no account.
 *
 * URL-safe base64 rather than flattening dozens of fields into a query string: the latter breaks
 * old links the moment a field is added or removed, while the former only needs the JSON shape to
 * stay backward compatible.
 *
 * 把方案参数编码进 URL，实现无需登录的分享。
 *
 * 用 URL-safe base64 而不是把几十个字段摊平成 query string：
 * 后者一旦增删字段就会破坏旧链接，前者只需保证 JSON 结构向后兼容。
 */

import { projectionInputSchema, type ProjectionInputDTO } from './schema.js';

const PARAM = 's';

function toUrlSafe(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromUrlSafe(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  return padded + '='.repeat((4 - (padded.length % 4)) % 4);
}

/**
 * UTF-8-safe base64 that works in both the browser and Node.
 * 浏览器与 Node 都可用的 UTF-8 安全 base64
 */
function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodeBase64(b64: string): string {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeInputToParam(input: ProjectionInputDTO): string {
  return toUrlSafe(encodeBase64(JSON.stringify(input)));
}

/**
 * Return null rather than throwing on a parse failure — truncated share links are routine and
 * shouldn't blank out the whole page.
 *
 * 解析失败时返回 null 而不是抛错——分享链接被截断是常态，不该让整个页面白屏
 */
export function decodeInputFromParam(param: string): ProjectionInputDTO | null {
  try {
    const parsed = projectionInputSchema.safeParse(JSON.parse(decodeBase64(fromUrlSafe(param))));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function buildShareUrl(baseUrl: string, input: ProjectionInputDTO): string {
  const url = new URL(baseUrl);
  url.searchParams.set(PARAM, encodeInputToParam(input));
  return url.toString();
}

export function readInputFromUrl(search: string): ProjectionInputDTO | null {
  const param = new URLSearchParams(search).get(PARAM);
  return param ? decodeInputFromParam(param) : null;
}

export const SHARE_PARAM = PARAM;
