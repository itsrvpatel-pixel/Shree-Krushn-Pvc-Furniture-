import { useEffect, useRef } from 'react';

/* Android's Back button, inside the app.

   The app has no URL of its own for anything - open a photo full screen,
   walk into a gallery album, open a customer's job, and the address bar
   says the same thing it did at the login screen. So Back had nothing to
   go back to and closed the app instead. Someone looking through the
   gallery lost the whole app on the first Back press.

   Each open screen holds one history entry. Back closes that screen, the
   way it does in every other app, and only the last Back leaves.

   Used from inside the component that IS the screen - the lightbox is
   mounted only while a photo is open, so it passes true - or with the
   flag that opens it. */

// Innermost screen last. One shared stack, because the first version
// gave every open screen its own popstate listener, and a single Back
// press then fired all of them: opening an album, then a photo, and
// pressing Back once shut both. Only the top of the stack should answer.
const stack = [];

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    const top = stack.pop();
    if (!top) return;
    // Cleared before closing: closing re-runs the effect below, which
    // must not read this as a close from the UI and pop a second entry.
    top.clear();
    top.close();
  });
}

function drop(entry) {
  const i = stack.lastIndexOf(entry);
  if (i === -1) return false;
  stack.splice(i, 1);
  return true;
}

export function useBackToClose(isOpen, close) {
  const entry = useRef(null);
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);

  useEffect(() => {
    if (isOpen && !entry.current) {
      const e = { close: () => closeRef.current(), clear: () => { entry.current = null; } };
      entry.current = e;
      stack.push(e);
      window.history.pushState({ skpvcScreen: true }, '');
    } else if (!isOpen && entry.current) {
      // Closed from the UI. The entry is still on the stack, so take it
      // off - otherwise the next Back would only undo this one and the
      // person would press it twice to get anywhere.
      const e = entry.current;
      entry.current = null;
      if (drop(e)) window.history.back();
    }
  }, [isOpen]);

  // Unmounted while still open - the parent moved on. Leave the stack as
  // we found it.
  useEffect(() => () => {
    const e = entry.current;
    if (!e) return;
    entry.current = null;
    if (drop(e)) window.history.back();
  }, []);
}
