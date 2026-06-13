import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

const DEFAULT_MESSAGE = 'You have an unsent change request. If you leave, it will be lost.';

export function useUnsavedChangesGuard(active: boolean, message: string = DEFAULT_MESSAGE): void {
  useEffect(() => {
    if (!active) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
    };

    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [active, message]);

  const blocker = useBlocker(active);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;

    const confirmed = window.confirm(message);
    if (confirmed) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker, message]);
}
