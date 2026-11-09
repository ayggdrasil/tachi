import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter(el => !(el as HTMLButtonElement).disabled && !el.hidden && el.getAttribute('aria-hidden') !== 'true');
}

/**
 * Shared modal behaviour: move focus in on mount (`[data-autofocus]` → first focusable → the container),
 * trap Tab / Shift+Tab inside, close on Escape, and return focus to the opener on unmount.
 */
export function useModal(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const root = ref.current; if (!root) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!root.hasAttribute('tabindex')) root.tabIndex = -1;
    const first = root.querySelector<HTMLElement>('[data-autofocus]') ?? focusables(root)[0] ?? root;
    first.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closeRef.current(); return; }
      if (e.key !== 'Tab') return;
      const box = ref.current; if (!box) return;
      const list = focusables(box);
      if (list.length === 0) { e.preventDefault(); box.focus(); return; }
      const firstEl = list[0], lastEl = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = !!active && box.contains(active);
      if (e.shiftKey && (!inside || active === firstEl || active === box)) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && (!inside || active === lastEl)) { e.preventDefault(); firstEl.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [ref]);
}
