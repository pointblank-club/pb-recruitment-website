import React, { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface EndContestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  contestName?: string;
}

export const EndContestModal: React.FC<EndContestModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  contestName = 'the contest',
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

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="end-contest-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // The content wrapper fills the dialog, so only backdrop clicks target the dialog itself
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="bg-black border border-gray-700 rounded-2xl p-0 max-w-md w-full shadow-2xl text-white backdrop:bg-black/75 backdrop:backdrop-blur-sm m-auto outline-none"
    >
      <div className="relative p-6">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon & Title */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3
              id="end-contest-dialog-title"
              className="text-xl font-bold text-white font-['DM_Sans']"
            >
              End Contest?
            </h3>
            <p className="text-xs text-gray-400 font-['DM_Sans']">
              {contestName}
            </p>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-2 mb-6 text-sm text-gray-300 font-['DM_Sans']">
          <p>
            Are you sure you want to leave and end your contest session on this device?
          </p>
          <p className="text-gray-400 text-xs">
            • Only answers and code solutions you have already submitted will be evaluated.
            <br />
            • Any unsubmitted code or unsaved changes in the editor will be lost.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 font-['DM_Sans']">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800 transition-colors text-sm font-medium"
          >
            Continue Contest
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors text-sm font-semibold shadow-lg shadow-red-600/20"
          >
            Yes, End Contest
          </button>
        </div>
      </div>
    </dialog>
  );
};
