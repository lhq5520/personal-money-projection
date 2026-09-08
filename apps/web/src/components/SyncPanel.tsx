import { useCallback, useEffect, useState } from 'react';
import type { ProjectionInputDTO, ScenarioDTO } from '@pmp/shared';
import { authClient, useSession } from '../lib/auth-client.js';
import { ApiError, scenarioApi } from '../lib/api.js';

interface Props {
  input: ProjectionInputDTO;
  onLoad: (input: ProjectionInputDTO) => void;
}

/**
 * 云端同步面板。
 *
 * 本地优先：未登录时整个应用功能完整，这个面板只是可选的备份层。
 * 后端不可达时也只降级为「离线」，绝不阻塞主流程。
 */
export function SyncPanel({ input, onLoad }: Props) {
  const { data: session, isPending } = useSession();
  const [scenarios, setScenarios] = useState<ScenarioDTO[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setScenarios(await scenarioApi.list());
    } catch (e) {
      if (!(e instanceof ApiError && e.isUnauthorized)) {
        setMessage({ kind: 'error', text: '无法读取云端方案，已继续使用本地数据' });
      }
    }
  }, []);

  useEffect(() => {
    if (session?.user) void refresh();
    else setScenarios([]);
  }, [session?.user, refresh]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res =
      mode === 'sign-up'
        ? await authClient.signUp.email({ email, password, name: email.split('@')[0] ?? '用户' })
        : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (res.error) {
      setMessage({ kind: 'error', text: res.error.message ?? '认证失败' });
    } else {
      setPassword('');
    }
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setMessage(null);
    try {
      const existing = scenarios.find((s) => s.name === trimmed);
      if (existing) {
        await scenarioApi.update(existing.id, { input, expectedUpdatedAt: existing.updatedAt });
        setMessage({ kind: 'ok', text: `已更新「${trimmed}」` });
      } else {
        await scenarioApi.create(trimmed, input);
        setMessage({ kind: 'ok', text: `已保存「${trimmed}」` });
      }
      await refresh();
    } catch (e) {
      // 冲突时把服务端最新版本摆出来，让用户自己决定保留哪份，而不是静默覆盖
      const text =
        e instanceof ApiError && e.isConflict
          ? '该方案已在其他设备上被修改。请先「载入」看一眼云端版本，再决定是否覆盖。'
          : e instanceof ApiError
            ? e.message
            : '保存失败';
      setMessage({ kind: 'error', text });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s: ScenarioDTO) => {
    setBusy(true);
    try {
      await scenarioApi.remove(s.id);
      await refresh();
      setMessage({ kind: 'ok', text: `已删除「${s.name}」` });
    } catch {
      setMessage({ kind: 'error', text: '删除失败' });
    } finally {
      setBusy(false);
    }
  };

  if (isPending) return <div className="panel"><span className="muted">正在检查登录状态…</span></div>;

  if (!session?.user) {
    return (
      <div className="panel">
        <h3>云端同步（可选）</h3>
        <p className="muted" style={{ margin: '0 0 12px' }}>
          不登录也能完整使用：参数自动存在这台设备的浏览器里，也可以用「复制分享链接」把方案发给别人。
          登录后可在多设备间同步方案。
        </p>
        <form onSubmit={handleAuth} className="stack" style={{ gap: 8 }}>
          <input className="text-input" type="email" required placeholder="邮箱" autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="text-input" type="password" required minLength={8} placeholder="密码（至少 8 位）"
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="btn-row">
            <button className="primary" type="submit" disabled={busy}>
              {mode === 'sign-up' ? '注册并登录' : '登录'}
            </button>
            <button type="button" onClick={() => setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up')}>
              {mode === 'sign-up' ? '已有账号？去登录' : '没有账号？去注册'}
            </button>
          </div>
        </form>
        {message && <p className={message.kind === 'error' ? 'error-text' : 'ok-text'}>{message.text}</p>}
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="chart-head">
        <h3 style={{ margin: 0 }}>云端方案</h3>
        <div className="btn-row">
          <span className="muted">{session.user.email}</span>
          <button onClick={() => void authClient.signOut()}>登出</button>
        </div>
      </div>

      <div className="btn-row" style={{ marginBottom: 12 }}>
        <input className="text-input" style={{ flex: 1, minWidth: 140 }} placeholder="方案名称，例如「基准」「跳槽 A」"
          value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary" onClick={() => void save()} disabled={busy || !name.trim()}>
          保存当前参数
        </button>
      </div>

      {scenarios.length === 0 ? (
        <p className="muted">还没有保存任何方案。</p>
      ) : (
        <div className="rows">
          {scenarios.map((s) => (
            <div className="row-line" key={s.id}>
              <span>
                {s.name}
                <span className="muted"> · {new Date(s.updatedAt).toLocaleString('zh-CN')}</span>
              </span>
              <span className="btn-row">
                <button onClick={() => { onLoad(s.input); setName(s.name); }}>载入</button>
                <button className="danger" onClick={() => void remove(s)} disabled={busy}>删除</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {message && <p className={message.kind === 'error' ? 'error-text' : 'ok-text'}>{message.text}</p>}
    </div>
  );
}
