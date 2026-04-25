import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type ToastKind = "info" | "success" | "warning" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
}

interface ToastCtx {
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback<ToastCtx["push"]>((t) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toast-stack" role="region" aria-label="Notifications">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setClosing(true), 4600);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={`toast toast-${toast.kind} ${closing ? "toast-closing" : ""}`} role="status">
      <div className="toast-rule" />
      <div className="toast-body">
        <div className="toast-title">{toast.title}</div>
        {toast.body && <div className="toast-text">{toast.body}</div>}
      </div>
      <button className="toast-close" onClick={onClose} aria-label="Dismiss">×</button>
    </div>
  );
}
