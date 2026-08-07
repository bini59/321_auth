// apps/admin/src/toast.tsx — window.confirm / alert 대체용 토스트 + 확인 다이얼로그
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CloseIcon } from './icons';

type Tone = 'ok' | 'warn' | 'danger';
type Toast = { id: number; text: string; tone: Tone };
type Confirm = { text: string; confirmLabel: string; tone: Tone; resolve: (ok: boolean) => void };

const TONE_COLOR: Record<Tone, string> = { ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)' };

const ToastContext = createContext<{
  toast: (text: string, tone?: Tone) => void;
  confirm: (text: string, options?: { confirmLabel?: string; tone?: Tone }) => Promise<boolean>;
}>({ toast: () => undefined, confirm: async () => false });

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<Confirm | null>(null);

  const toast = useCallback((text: string, tone: Tone = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, text, tone }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3600);
  }, []);

  const confirm = useCallback(
    (text: string, options?: { confirmLabel?: string; tone?: Tone }) =>
      new Promise<boolean>((resolve) => {
        setPending({ text, confirmLabel: options?.confirmLabel ?? '확인', tone: options?.tone ?? 'warn', resolve });
      }),
    [],
  );

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  const settle = (ok: boolean) => { pending?.resolve(ok); setPending(null); };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {pending && (
        <div className="palette-backdrop" onClick={() => settle(false)} style={{ alignItems: 'flex-start' }}>
          <div className="palette" style={{ width: 'min(400px, 92vw)' }} onClick={(event) => event.stopPropagation()}>
            <div className="card-body">
              <p style={{ margin: 0, fontSize: 14 }}>{pending.text}</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
                <button className="btn" onClick={() => settle(false)}>취소</button>
                <button
                  className={pending.tone === 'danger' ? 'btn btn--danger' : 'btn btn--primary'}
                  onClick={() => settle(true)}
                >
                  {pending.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="toasts">
        {toasts.map((t) => (
          <div className="toast" key={t.id} role="status">
            <span className="dot" style={{ background: TONE_COLOR[t.tone] }} />
            <span className="spacer">{t.text}</span>
            <button className="icon-btn" onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))} aria-label="닫기">
              <CloseIcon size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
