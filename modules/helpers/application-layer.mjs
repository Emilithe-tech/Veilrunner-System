/** Promote a Veilrunner application above every currently open application.
 * Foundry's built-in promotion does not know about the standalone Datapad,
 * so both native sheets and the Datapad use this shared DOM layer allocator. */
export function bringVeilrunnerApplicationToFront(element, application = null) {
  application?.bringToFront?.();
  const root = element?.closest?.(".app, .application, .window-app, .vr-player-datapad") ?? element;
  if (!root) return;

  // Foundry v14 applications no longer consistently use the legacy `.app`
  // class.  Include both generations here so clicking an already-open sheet
  // receives a layer above every other open window, not just the Datapad.
  const highest = Array.from(document.querySelectorAll(".app, .application, .window-app, [data-appid], .vr-player-datapad"))
    .filter(candidate => candidate !== root)
    .reduce((maximum, candidate) => {
      const zIndex = Number.parseInt(getComputedStyle(candidate).zIndex, 10);
      return Number.isFinite(zIndex) ? Math.max(maximum, zIndex) : maximum;
    }, 100);
  root.style.zIndex = String(highest + 1);
}
