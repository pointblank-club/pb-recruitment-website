import type React from 'react';

export const preventClipboardAction = (event: React.ClipboardEvent<HTMLElement>) => {
  event.preventDefault();
  event.stopPropagation();
};

export const preventContextMenu = (event: React.MouseEvent<HTMLElement>) => {
  event.preventDefault();
};

export const preventClipboardShortcut = (event: React.KeyboardEvent<HTMLElement>) => {
  const key = event.key.toLowerCase();
  const controlShortcut = (event.ctrlKey || event.metaKey) && ['c', 'x', 'v', 'insert'].includes(key);
  const shiftInsertPaste = event.shiftKey && key === 'insert';

  if (controlShortcut || shiftInsertPaste) {
    event.preventDefault();
    event.stopPropagation();
  }
};
