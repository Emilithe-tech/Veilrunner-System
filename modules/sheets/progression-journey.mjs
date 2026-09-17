/** Bind incremental loading and interruptible, sheet-local disclosure animation. */
export function bindProgressionJourney(root, { loadMore, onScroll, onOpen, initialScroll }) {
  const controller = new AbortController();
  const animations = new Map();
  let pending = null;
  let frame = 0;
  let disposed = false;
  const signal = controller.signal;
  root.scrollTop = initialScroll ?? Math.max(0, (root.querySelector('[data-current-level="true"]')?.offsetTop ?? 0) - 12);

  const load = () => {
    if (pending || disposed || !root.isConnected) return pending;
    const button = root.querySelector('[data-action="loadProgressionLevels"]');
    root.setAttribute('aria-busy', 'true');
    if (button) button.disabled = true;
    pending = Promise.resolve().then(() => loadMore(root)).catch(error => {
      console.error('Veilrunner | Could not load future levels', error);
    }).finally(() => {
      pending = null;
      root.removeAttribute('aria-busy');
      if (button) button.disabled = false;
    });
    return pending;
  };
  root.addEventListener('scroll', () => {
    onScroll(root.scrollTop);
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (root.scrollHeight - root.scrollTop - root.clientHeight < 240) void load();
    });
  }, { passive: true, signal });
  root.addEventListener('toggle', event => {
    const row = event.target;
    if (row.matches?.('[data-journey-level]') && !animations.has(row)) onOpen(Number(row.dataset.journeyLevel), row.open);
  }, { capture: true, signal });
  root.addEventListener('click', event => {
    const summary = event.target.closest('summary');
    if (!summary || event.target.closest('button, a, input, select') || !root.contains(summary)) return;
    const row = summary.parentElement;
    const body = row.querySelector('.progression-milestone-body');
    if (!body) return;
    event.preventDefault();
    const previous = animations.get(row);
    const opening = !(previous?.opening ?? row.open);
    const from = row.open ? Number.parseFloat(getComputedStyle(body).height) || 0 : 0;
    previous?.animation.cancel();
    animations.delete(row);
    onOpen(Number(row.dataset.journeyLevel), opening);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      row.open = opening;
      body.style.removeProperty('overflow');
      return;
    }
    row.open = true;
    const to = opening ? body.offsetHeight : 0;
    const padding = getComputedStyle(body).paddingBlock;
    body.style.overflow = 'hidden';
    const animation = body.animate([
      { height: `${from}px`, paddingBlock: from === 0 ? '0px' : padding, opacity: opening ? .4 : 1 },
      { height: `${to}px`, paddingBlock: opening ? padding : '0px', opacity: opening ? 1 : 0 }
    ], {
      duration: 180, easing: 'cubic-bezier(.2,.7,.2,1)'
    });
    animations.set(row, { animation, opening });
    animation.finished.then(() => {
      if (animations.get(row)?.animation !== animation) return;
      animations.delete(row);
      row.open = opening;
      body.style.removeProperty('overflow');
    }).catch(() => {});
  }, { signal });
  return {
    load,
    destroy() {
      disposed = true;
      controller.abort();
      cancelAnimationFrame(frame);
      for (const [row, { animation, opening }] of animations) {
        animation.cancel();
        row.open = opening;
        row.querySelector('.progression-milestone-body')?.style.removeProperty('overflow');
      }
      animations.clear();
    }
  };
}
