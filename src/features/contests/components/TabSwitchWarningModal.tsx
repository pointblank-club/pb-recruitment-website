import React, { useEffect, useRef } from 'react';
import { AlertTriangle, ShieldAlert, X } from 'lucide-react';

interface TabSwitchWarningModalProps {
  isOpen: boolean;
  count: number;
  maxSwitches?: number;
  isTerminated: boolean;
  onAcknowledge: () => void;
  onExitContest: () => void;
}

export const TabSwitchWarningModal: React.FC<TabSwitchWarningModalProps> = ({
  isOpen,
  count,
  maxSwitches = 5,
  isTerminated,
  onAcknowledge,
  onExitContest,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  const remaining = Math.max(0, maxSwitches - count);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="tab-switch-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!isTerminated) {
          onAcknowledge();
        } else {
          onExitContest();
        }
      }}
      className="bg-black border border-gray-700 rounded-2xl p-0 max-w-md w-full shadow-2xl text-white backdrop:bg-black/85 backdrop:backdrop-blur-md m-auto outline-none"
    >
      <div className="relative p-6 font-['DM_Sans']">
        {!isTerminated && (
          <button
            type="button"
            onClick={onAcknowledge}
            aria-label="Close dialog"
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {isTerminated ? (
          <div>
            {/* Terminated State */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/40 flex items-center justify-center flex-shrink-0 animate-pulse">
                <ShieldAlert className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3
                  id="tab-switch-dialog-title"
                  className="text-xl font-bold text-red-400"
                >
                  Contest Terminated
                </h3>
                <p className="text-xs text-gray-400">
                  Maximum tab switches exceeded ({count}/{maxSwitches})
                </p>
              </div>
            </div>

            <div className="space-y-3 mb-6 text-sm text-gray-300">
              <div className="bg-red-950/40 border border-red-800/50 rounded-lg p-3 text-red-200 text-xs">
                ⚠️ You have reached <strong>{count} tab switches</strong>. As per test integrity rules, your contest session has been ended automatically.
              </div>
              <p className="text-xs text-gray-400">
                • All code and MCQ answers you submitted before this termination remain saved.
                <br />
                • Unsubmitted code drafts are preserved locally and won't be lost.
                <br />
                • If this termination was due to a technical error or emergency, please contact the contest administrator to reactivate your session.
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onExitContest}
                className="w-full py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-red-600/30"
              >
                Exit Contest
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Warning State */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/40 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h3
                  id="tab-switch-dialog-title"
                  className="text-xl font-bold text-amber-400"
                >
                  Tab Switch Detected
                </h3>
                <p className="text-xs text-gray-400">
                  Warning {count} of {maxSwitches}
                </p>
              </div>
            </div>

            <div className="space-y-3 mb-6 text-sm text-gray-300">
              <div className="bg-amber-950/40 border border-amber-800/50 rounded-lg p-3 text-amber-200 text-xs">
                You navigated away from the contest tab. You have <strong>{remaining} {remaining === 1 ? 'warning' : 'warnings'} remaining</strong> before automatic contest termination.
              </div>

              {/* Progress visualizer */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Violations</span>
                  <span className="font-mono font-semibold text-amber-400">{count}/{maxSwitches}</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden flex gap-1 p-0.5">
                  {Array.from({ length: maxSwitches }).map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-full flex-1 rounded-full transition-all ${
                        idx < count
                          ? idx === maxSwitches - 1
                            ? 'bg-red-500'
                            : 'bg-amber-400'
                          : 'bg-gray-700'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <p className="text-xs text-gray-400">
                Please remain on this tab until you finish. Switching tabs {maxSwitches} times will immediately lock and submit your contest.
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onAcknowledge}
                className="w-full py-2.5 px-4 rounded-lg bg-green text-black hover:bg-green-600 font-semibold text-sm transition-colors shadow-md"
              >
                I Understand & Continue Contest
              </button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
};
