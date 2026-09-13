import { useCallback, useEffect, useState } from 'react';
import type { ProjectionInputDTO, ScenarioDTO } from '@pmp/shared';
import { authClient, useSession } from '../lib/auth-client.js';
import { useI18n } from '../i18n/index.js';
import { ApiError, scenarioApi } from '../lib/api.js';

interface Props {
  input: ProjectionInputDTO;
  onLoad: (input: ProjectionInputDTO) => void;
}

/**
 * The cloud sync panel.
 *
 * Local-first: the whole app is fully functional while signed out, and this panel is only an
 * optional backup layer. If the backend is unreachable it degrades to "offline" and never blocks
 * the main flow.
 *
 * 云端同步面板。
 *
 * 本地优先：未登录时整个应用功能完整，这个面板只是可选的备份层。
 * 后端不可达时也只降级为「离线」，绝不阻塞主流程。
 */
export function SyncPanel({ input, onLoad }: Props) {
  const { t } = useI18n();
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
        setMessage({ kind: 'error', text: t('sync.loadFailed') });
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
        ? await authClient.signUp.email({ email, password, name: email.split('@')[0] ?? 'user' })
        : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (res.error) {
      setMessage({ kind: 'error', text: res.error.message ?? t('sync.authFailed') });
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
        setMessage({ kind: 'ok', text: t('sync.updated', { name: trimmed }) });
      } else {
        await scenarioApi.create(trimmed, input);
        setMessage({ kind: 'ok', text: t('sync.saved', { name: trimmed }) });
      }
      await refresh();
    } catch (e) {
      // On conflict, surface the server's latest version and let the user decide which to keep,
      // rather than silently overwriting.
      // 冲突时把服务端最新版本摆出来，让用户自己决定保留哪份，而不是静默覆盖
      const text =
        e instanceof ApiError && e.isConflict
          ? t('sync.conflict')
          : e instanceof ApiError
            ? e.message
            : t('sync.saveFailed');
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
      setMessage({ kind: 'ok', text: t('sync.deleted', { name: s.name }) });
    } catch {
      setMessage({ kind: 'error', text: t('sync.deleteFailed') });
    } finally {
      setBusy(false);
    }
  };

  if (isPending) return <div className="panel"><span className="muted">{t('sync.checking')}</span></div>;

  if (!session?.user) {
    return (
      <div className="panel">
        <h3>{t('sync.titleAnon')}</h3>
        <p className="muted" style={{ margin: '0 0 12px' }}>
{t('sync.intro')}
        </p>
        <form onSubmit={handleAuth} className="stack" style={{ gap: 8 }}>
          <input className="text-input" type="email" required placeholder={t('sync.email')} autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="text-input" type="password" required minLength={8} placeholder={t('sync.password')}
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="btn-row">
            <button className="primary" type="submit" disabled={busy}>
              {mode === 'sign-up' ? t('sync.signUp') : t('sync.signIn')}
            </button>
            <button type="button" onClick={() => setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up')}>
              {mode === 'sign-up' ? t('sync.toSignIn') : t('sync.toSignUp')}
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
        <h3 style={{ margin: 0 }}>{t('sync.title')}</h3>
        <div className="btn-row">
          <span className="muted">{session.user.email}</span>
          <button onClick={() => void authClient.signOut()}>{t('sync.signOut')}</button>
        </div>
      </div>

      <div className="btn-row" style={{ marginBottom: 12 }}>
        <input className="text-input" style={{ flex: 1, minWidth: 140 }} placeholder={t('sync.namePlaceholder')}
          value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary" onClick={() => void save()} disabled={busy || !name.trim()}>
          {t('sync.save')}
        </button>
      </div>

      {scenarios.length === 0 ? (
        <p className="muted">{t('sync.empty')}</p>
      ) : (
        <div className="rows">
          {scenarios.map((s) => (
            <div className="row-line" key={s.id}>
              <span>
                {s.name}
                <span className="muted"> · {new Date(s.updatedAt).toLocaleString('zh-CN')}</span>
              </span>
              <span className="btn-row">
                <button onClick={() => { onLoad(s.input); setName(s.name); }}>{t('sync.load')}</button>
                <button className="danger" onClick={() => void remove(s)} disabled={busy}>{t('sync.delete')}</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {message && <p className={message.kind === 'error' ? 'error-text' : 'ok-text'}>{message.text}</p>}
    </div>
  );
}
