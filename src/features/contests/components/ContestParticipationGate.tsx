import { useEffect, useRef, useState, type RefObject } from 'react';
import { Button } from '@/components/ui/button';

interface ContestParticipationGateProps {
  isExitingRef: RefObject<boolean>;
  endTime: number;
}

export const ContestParticipationGate = ({ isExitingRef, endTime }: ContestParticipationGateProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [hasEntered, setHasEntered] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);
  const [demoWithoutFullscreen, setDemoWithoutFullscreen] = useState(false);
  const [tabWarning, setTabWarning] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);
  const fullscreenSupported = document.fullscreenEnabled &&
    typeof document.documentElement.requestFullscreen === 'function';
  const needsFullscreen = !isFullscreen && !demoWithoutFullscreen;
  const showGate = !hasEntered || needsFullscreen || tabWarning;

  useEffect(() => {
    let wasHidden = false;
    const shouldIgnore = () => isExitingRef.current || Date.now() >= endTime;
    const onFullscreenChange = () => {
      if (!shouldIgnore()) setIsFullscreen(!!document.fullscreenElement);
    };
    const onVisibilityChange = () => {
      if (shouldIgnore() || !hasEntered) return;
      if (document.hidden) {
        wasHidden = true;
      } else {
        if (wasHidden) setTabWarning(true);
        wasHidden = false;
        onFullscreenChange();
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [hasEntered, isExitingRef, endTime]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (showGate && dialog && !dialog.open) dialog.showModal();
    return () => { dialog?.close(); };
  }, [showGate]);

  const continueContest = async () => {
    setRequestError('');
    setIsRequesting(true);
    try {
      if (needsFullscreen) {
        await document.documentElement.requestFullscreen();
        if (!document.fullscreenElement) throw new Error('Fullscreen did not open.');
      }
      if (isExitingRef.current || Date.now() >= endTime) return;
      setIsFullscreen(!!document.fullscreenElement);
      setHasEntered(true);
      setTabWarning(false);
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
        {!hasEntered ? 'Before you enter the contest' : needsFullscreen ? 'Return to fullscreen' : 'Stay on the contest tab'}
      </h2>
      <p id="contest-participation-notice" className="text-gray-300 mb-4">
        Stay in fullscreen and keep the contest tab visible while participating.
      </p>
      {tabWarning && (
        <p role="alert" className="text-yellow-300 mb-4">
          You left the contest tab. Please remain on the contest tab.
        </p>
      )}
      {!fullscreenSupported && needsFullscreen ? (
        <>
          <p className="text-gray-300 mb-4">
            Fullscreen is unavailable in this browser or browsing context. You can continue this demo without fullscreen.
          </p>
          <Button type="button" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => {
            setDemoWithoutFullscreen(true);
            setHasEntered(true);
            setTabWarning(false);
          }}>
            Continue demo without fullscreen
          </Button>
        </>
      ) : (
        <>
          {requestError && <p role="alert" className="text-red-300 mb-4">{requestError}</p>}
          <Button type="button" disabled={isRequesting} onClick={continueContest} className="bg-green-600 hover:bg-green-700 text-white">
            {isRequesting ? 'Requesting fullscreen…' : requestError ? 'Retry' : needsFullscreen ?
              (hasEntered ? 'Return to fullscreen' : 'Enter fullscreen') : 'Continue contest'}
          </Button>
        </>
      )}
    </dialog>
  );
};
