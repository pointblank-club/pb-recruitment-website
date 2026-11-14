import { useEffect } from 'react';
import { toast } from 'react-toastify';
import { isClipboardAllowed, preventClipboardShortcut } from '../clipboardGuards';

interface UseContestEventBlockerOptions {
  enabled?: boolean;
}

// shortcut: page events cannot enforce browser lockdown; use a managed exam browser for tamper resistance.
export const useContestEventBlocker = ({
  enabled = true,
}: UseContestEventBlockerOptions = {}) => {
  useEffect(() => {
    if (!enabled) return;

    const blockEvent = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    const handleCopy = (e: ClipboardEvent) => {
      if (isClipboardAllowed(e.target)) return;
      blockEvent(e);
      toast.warning('Copying is disabled during the contest.', {
        toastId: 'clipboard-copy-blocked',
        autoClose: 2000,
      });
    };

    const handlePaste = (e: ClipboardEvent) => {
      if (isClipboardAllowed(e.target)) return;
      blockEvent(e);
      toast.warning('Pasting is disabled during the contest.', {
        toastId: 'clipboard-paste-blocked',
        autoClose: 2000,
      });
    };

    const handleCut = (e: ClipboardEvent) => {
      if (isClipboardAllowed(e.target)) return;
      blockEvent(e);
      toast.warning('Cutting is disabled during the contest.', {
        toastId: 'clipboard-cut-blocked',
        autoClose: 2000,
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.getModifierState('AltGraph')) return;
      const key = (e.code.startsWith('Key') ? e.code.slice(3) : e.key).toLowerCase();
      // Cancel browser tools without suppressing Monaco redo or its macOS Tab-focus command.
      if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && ['z', 'm'].includes(key) &&
          e.target instanceof Element && e.target.closest('.monaco-editor')) {
        e.preventDefault();
        return;
      }
      if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && key === 'z' &&
          e.target instanceof Element && e.target.matches('input:read-write, textarea:read-write')) return;
      const isDeveloperToolShortcut = key === 'f12' ||
        (e.ctrlKey && e.shiftKey && ['i', 'j', 'c', 'k', 'e', 'm', 'z'].includes(key)) ||
        (e.metaKey && e.altKey && ['i', 'j', 'c', 'k', 'e', 'm', 'z', 'u'].includes(key)) ||
        (e.metaKey && e.shiftKey && key === 'c') ||
        (e.shiftKey && ['f4', 'f5', 'f7', 'f9'].includes(key));
      const isBrowserShortcut = ((e.ctrlKey || e.metaKey) && !e.altKey && ['p', 's'].includes(key)) ||
        (e.ctrlKey && !e.altKey && !e.shiftKey && key === 'u');
      const isContextMenuShortcut = key === 'contextmenu' || (e.shiftKey && key === 'f10');

      if (isDeveloperToolShortcut || isBrowserShortcut || isContextMenuShortcut) {
        blockEvent(e);
        if (!e.repeat) {
          toast.warning('This shortcut is disabled during the contest.', {
            toastId: 'contest-shortcut-blocked',
            autoClose: 2000,
          });
        }
        return;
      }

      preventClipboardShortcut(e);
      if (e.defaultPrevented) e.stopImmediatePropagation();
    };

    // Use capturing phase (true) so the blocker runs before child components or libraries process events
    window.addEventListener('copy', handleCopy, true);
    window.addEventListener('paste', handlePaste, true);
    window.addEventListener('cut', handleCut, true);
    window.addEventListener('contextmenu', blockEvent, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('dragstart', blockEvent, true);
    window.addEventListener('dragover', blockEvent, true);
    window.addEventListener('drop', blockEvent, true);

    return () => {
      window.removeEventListener('copy', handleCopy, true);
      window.removeEventListener('paste', handlePaste, true);
      window.removeEventListener('cut', handleCut, true);
      window.removeEventListener('contextmenu', blockEvent, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('dragstart', blockEvent, true);
      window.removeEventListener('dragover', blockEvent, true);
      window.removeEventListener('drop', blockEvent, true);
    };
  }, [enabled]);
};
