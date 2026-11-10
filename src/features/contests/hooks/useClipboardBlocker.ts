import { useEffect } from 'react';
import { toast } from 'react-toastify';

interface UseClipboardBlockerOptions {
  enabled?: boolean;
  blockCopy?: boolean;
  blockPaste?: boolean;
  blockCut?: boolean;
  blockContextMenu?: boolean;
}

/**
 * Prevents clipboard operations (copy, paste, cut) and context menu
 * during active contests to maintain contest integrity.
 */
export const useClipboardBlocker = ({
  enabled = true,
  blockCopy = true,
  blockPaste = true,
  blockCut = true,
  blockContextMenu = true,
}: UseClipboardBlockerOptions = {}) => {
  useEffect(() => {
    if (!enabled) return;

    const handleCopy = (e: ClipboardEvent) => {
      if (blockCopy) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        toast.warning('Copying is disabled during the contest.', {
          toastId: 'clipboard-copy-blocked',
          autoClose: 2000,
        });
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      if (blockPaste) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        toast.warning('Pasting is disabled during the contest.', {
          toastId: 'clipboard-paste-blocked',
          autoClose: 2000,
        });
      }
    };

    const handleCut = (e: ClipboardEvent) => {
      if (blockCut) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        toast.warning('Cutting is disabled during the contest.', {
          toastId: 'clipboard-cut-blocked',
          autoClose: 2000,
        });
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (blockContextMenu) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
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
  }, [enabled, blockCopy, blockPaste, blockCut, blockContextMenu]);
};
