import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useIdentity } from "../lib/auth";
import { useToast } from "../components/NotificationToast";
import { useDrillSessions, useDeleteDrillSession } from "./useDrillData";
import type { DrillSession } from "../types/drill";

export interface ActiveDrillGuard {
  activeSession: DrillSession | null;
  showModal: boolean;
  isDeleting: boolean;
  /** Call before any drill entry point. Runs `action` immediately when no active session exists;
   *  otherwise stores it and opens the guard modal. `from` is forwarded as router state so the
   *  drill's Done button can navigate back to the right page. */
  guard: (action: () => Promise<void> | void, from?: string) => void;
  handleDeleteAndNew: () => Promise<void>;
  handleResume: () => void;
  handleClose: () => void;
}

export function useActiveDrillGuard(): ActiveDrillGuard {
  const { userId } = useIdentity();
  const navigate = useNavigate();
  const toast = useToast();

  const { data: sessions } = useDrillSessions(userId);
  const removeSession = useDeleteDrillSession();

  const activeSession = sessions?.find(s => s.status === "active") ?? null;

  const [showModal, setShowModal] = useState(false);
  const pendingRef = useRef<(() => Promise<void> | void) | null>(null);
  const pendingFromRef = useRef<string | null>(null);

  function guard(action: () => Promise<void> | void, from?: string) {
    pendingFromRef.current = from ?? null;
    if (activeSession) {
      pendingRef.current = action;
      setShowModal(true);
    } else {
      void action();
    }
  }

  async function handleDeleteAndNew() {
    if (!activeSession || !userId) return;
    try {
      await removeSession.mutateAsync({ sessionId: activeSession.id, userId });
      const cb = pendingRef.current;
      pendingRef.current = null;
      setShowModal(false);
      if (cb) await cb();
    } catch (err) {
      toast.push({ kind: "error", title: "Could not delete session", body: String(err) });
    }
  }

  function handleResume() {
    if (!activeSession) return;
    const from = pendingFromRef.current ?? undefined;
    pendingRef.current = null;
    pendingFromRef.current = null;
    setShowModal(false);
    navigate(`/drill/session/${activeSession.id}`, { state: { from } });
  }

  function handleClose() {
    pendingRef.current = null;
    pendingFromRef.current = null;
    setShowModal(false);
  }

  return {
    activeSession,
    showModal,
    isDeleting: removeSession.isPending,
    guard,
    handleDeleteAndNew,
    handleResume,
    handleClose,
  };
}
