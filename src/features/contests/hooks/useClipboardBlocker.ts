import { useEffect, type RefObject } from 'react';
import { toast } from 'react-toastify';
import { isClipboardAllowed } from '../clipboardGuards';

interface UseClipboardBlockerOptions {
  enabled?: boolean;
  containerRef?: RefObject<HTMLElement | null>;
}

/**
 * Prevents clipboard operations (copy, paste, cut) and context menu
 * during active contests to maintain contest integrity.
 */
export const useClipboardBlocker = ({
  enabled = true,
  containerRef,
}: UseClipboardBlockerOptions = {}) => {
  useEffect(() => {
    if (!enabled) return;

    const isInsideContainer = (e: Event) => {
      if (!containerRef?.current) return true;
      const target = e.target as Node | null;
      if (target && containerRef.current.contains(target)) return true;
      const selection = window.getSelection();
      if (selection && selection.anchorNode && containerRef.current.contains(selection.anchorNode)) {
        return true;
      }
      return false;
    };

    const handleCopy = (e: ClipboardEvent) => {
      if (isClipboardAllowed(e.target)) return;
      if (!isInsideContainer(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      toast.warning('Copying is disabled during the contest.', {
        toastId: 'clipboard-copy-blocked',
        autoClose: 2000,
      });
    };

    const handlePaste = (e: ClipboardEvent) => {
      if (isClipboardAllowed(e.target)) return;
      if (!isInsideContainer(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      toast.warning('Pasting is disabled during the contest.', {
        toastId: 'clipboard-paste-blocked',
        autoClose: 2000,
      });
    };

    const handleCut = (e: ClipboardEvent) => {
      if (isClipboardAllowed(e.target)) return;
      if (!isInsideContainer(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      toast.warning('Cutting is disabled during the contest.', {
        toastId: 'clipboard-cut-blocked',
        autoClose: 2000,
      });
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (isClipboardAllowed(e.target)) return;
      if (!isInsideContainer(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    // Use capturing phase (true) so the blocker runs before child components or libraries process events
    window.addEventListener('copy', handleCopy, true);
    window.addEventListener('paste', handlePaste, true);
    window.addEventListener('cut', handleCut, true);
    window.addEventListener('contextmenu', handleContextMenu, true);

    return () => {
      window.removeEventListener('copy', handleCopy, true);
      window.removeEventListener('paste', handlePaste, true);
      window.removeEventListener('cut', handleCut, true);
      window.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }, [enabled, containerRef]);
};
