import type React from 'react';

export const isClipboardAllowed = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest('[data-clipboard-allowed="true"]');

export const preventClipboardAction = (event: React.ClipboardEvent<HTMLElement>) => {
  if (isClipboardAllowed(event.target)) return;
  event.preventDefault();
  event.stopPropagation();
};

export const preventContextMenu = (event: React.MouseEvent<HTMLElement>) => {
  if (isClipboardAllowed(event.target)) return;
  event.preventDefault();
};

export const preventClipboardShortcut = (event: React.KeyboardEvent<HTMLElement>) => {
  if (isClipboardAllowed(event.target)) return;
  const key = event.key.toLowerCase();
  const controlShortcut = (event.ctrlKey || event.metaKey) && ['c', 'x', 'v', 'insert'].includes(key);
  const shiftInsertPaste = event.shiftKey && key === 'insert';

  if (controlShortcut || shiftInsertPaste) {
    event.preventDefault();
    event.stopPropagation();
  }
};
