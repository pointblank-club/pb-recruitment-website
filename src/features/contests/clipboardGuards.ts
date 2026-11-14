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

export const preventClipboardShortcut = (event: KeyboardEvent | React.KeyboardEvent<HTMLElement>) => {
  if (isClipboardAllowed(event.target) || event.altKey) return;
  const key = event.key.toLowerCase();
  const controlShortcut = (event.ctrlKey || event.metaKey) && ['c', 'x', 'v', 'insert'].includes(key);
  const shiftClipboardShortcut = event.shiftKey && !event.ctrlKey && !event.metaKey && ['insert', 'delete'].includes(key);

  if (controlShortcut || shiftClipboardShortcut) {
    event.preventDefault();
    event.stopPropagation();
  }
};
