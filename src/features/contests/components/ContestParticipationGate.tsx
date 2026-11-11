import { useEffect, useRef, useState, type RefObject } from 'react';
import { Button } from '@/components/ui/button';

interface ContestParticipationGateProps {
  isExitingRef: RefObject<boolean>;
  endTime: number;
  onLeave: () => void;
  suspended?: boolean;
  onEnteredChange?: (entered: boolean) => void;
}

const canRestoreFocusTarget = (
  target: HTMLElement | null,
  exitingRef: RefObject<boolean>,
  suspendedStateRef: RefObject<boolean>
): target is HTMLElement =>
  Boolean(
    !exitingRef.current &&
      !suspendedStateRef.current &&
      target &&
      target.isConnected &&
      !target.hasAttribute('disabled') &&
      !document.querySelector('dialog[open]')
  );

export const ContestParticipationGate = ({
  isExitingRef,
  endTime,
  onLeave,
  suspended = false,
  onEnteredChange,
}: ContestParticipationGateProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  const [hasEntered, setHasEntered] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);
  const [demoWithoutFullscreen, setDemoWithoutFullscreen] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);
  const fullscreenSupported = document.fullscreenEnabled &&
    typeof document.documentElement.requestFullscreen === 'function';
  const needsFullscreen = !isFullscreen && !demoWithoutFullscreen;
  const showGate = !suspended && (!hasEntered || needsFullscreen);

  useEffect(() => {
    onEnteredChange?.(hasEntered);
  }, [hasEntered, onEnteredChange]);

  useEffect(() => {
    const shouldIgnore = () => isExitingRef.current || Date.now() >= endTime;
    const onFullscreenChange = () => {
      if (!shouldIgnore()) setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [isExitingRef, endTime]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!showGate) {
      if (dialog?.open) dialog.close();
      return undefined;
    }

    const active = document.activeElement;
    if (
      !previousFocusRef.current &&
      active instanceof HTMLElement &&
      active !== document.body &&
      !active.closest('dialog')
    ) {
      previousFocusRef.current = active;
    }

    if (dialog && !dialog.open) dialog.showModal();

    return () => {
      if (dialog?.open) dialog.close();
      if (suspendedRef.current) {
        // Keep the captured focus target across modal suspension so closing Return-to-Fullscreen restores it.
        return;
      }
      const target = previousFocusRef.current;
      previousFocusRef.current = null;
      if (canRestoreFocusTarget(target, isExitingRef, suspendedRef)) {
        target.focus({ preventScroll: true });
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => {
            if (
              canRestoreFocusTarget(target, isExitingRef, suspendedRef) &&
              (document.activeElement === document.body || document.activeElement === null)
            ) {
              target.focus({ preventScroll: true });
            }
          });
        }
      }
    };
  }, [showGate, isExitingRef]);

  const continueContest = async () => {
    setRequestError('');
    setIsRequesting(true);
    try {
      if (needsFullscreen) {
        await document.documentElement.requestFullscreen();
        if (!document.fullscreenElement) throw new Error('Fullscreen did not open.');
      }
      if (isExitingRef.current || Date.now() >= endTime) {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        return;
      }
      setIsFullscreen(!!document.fullscreenElement);
      setHasEntered(true);
    } catch (error) {
      setRequestError(`Fullscreen request failed. Allow fullscreen in your browser, then retry.${
        error instanceof Error ? ` ${error.message}` : ''
      }`);
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="contest-participation-title"
      aria-describedby="contest-participation-notice"
      onCancel={(event) => event.preventDefault()}
      className="bg-black border border-gray-700 rounded-2xl p-6 max-w-md w-full shadow-2xl text-white backdrop:bg-black/75 backdrop:backdrop-blur-sm m-auto"
    >
      <h2 id="contest-participation-title" className="text-xl font-bold mb-3">
        {!hasEntered ? 'Before you enter the contest' : 'Return to fullscreen'}
      </h2>
      <p id="contest-participation-notice" className="text-gray-300 mb-4">
        Stay in fullscreen while participating.
      </p>
      {!fullscreenSupported && needsFullscreen ? (
        <>
          <p className="text-gray-300 mb-4">
            Fullscreen is unavailable in this browser or browsing context. You can continue this demo without fullscreen.
          </p>
          <Button type="button" className="w-full bg-green-600 hover:bg-green-700 text-white" onClick={() => {
            setDemoWithoutFullscreen(true);
            setHasEntered(true);
          }}>
            Continue demo without fullscreen
          </Button>
        </>
      ) : (
        <>
          {requestError && <p role="alert" className="text-red-300 mb-4">{requestError}</p>}
          <Button type="button" disabled={isRequesting} onClick={continueContest} className="w-full bg-green-600 hover:bg-green-700 text-white">
            {isRequesting ? 'Requesting fullscreen…' : requestError ? 'Retry' : needsFullscreen ?
              (hasEntered ? 'Return to fullscreen' : 'Enter fullscreen') : 'Continue contest'}
          </Button>
        </>
      )}
      <Button type="button" variant="outline" className="mt-3 w-full border-gray-600 bg-gray-800 text-white hover:bg-gray-700 hover:text-white" onClick={onLeave}>
        Leave contest
      </Button>
    </dialog>
  );
};
