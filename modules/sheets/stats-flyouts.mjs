/** Bind delayed, plain-text Stats descriptions; return cleanup for render/close. */
export function bindStatsFlyouts(root) {
  if (!root) return () => {};
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  const controller = new view.AbortController();
  const options = { signal: controller.signal };
  let timer;
  let flyout;
  let described;
  let previousDescription;
  const hide = () => {
    view.clearTimeout(timer);
    flyout?.remove();
    flyout = null;
    if (described) {
      if (previousDescription === null) described.removeAttribute("aria-describedby");
      else described.setAttribute("aria-describedby", previousDescription);
    }
    described = null;
  };
  const schedule = (element) => {
    hide();
    timer = view.setTimeout(() => {
      if (!element.isConnected) return;
      flyout = doc.createElement("div");
      flyout.className = "vr-stats-flyout";
      flyout.id = `vr-stats-flyout-${view.crypto.randomUUID()}`;
      flyout.setAttribute("role", "tooltip");
      flyout.textContent = element.dataset.statsHint;
      doc.body.append(flyout);
      described = element;
      previousDescription = element.getAttribute("aria-describedby");
      element.setAttribute("aria-describedby", [previousDescription, flyout.id].filter(Boolean).join(" "));
      const rect = element.getBoundingClientRect();
      const bounds = flyout.getBoundingClientRect();
      flyout.style.left = `${Math.max(8, Math.min(rect.left, view.innerWidth - bounds.width - 8))}px`;
      const top = rect.bottom + 8;
      flyout.style.top = `${Math.max(8, top + bounds.height <= view.innerHeight - 8 ? top : rect.top - bounds.height - 8)}px`;
    }, 3000);
  };
  for (const element of root.querySelectorAll("[data-stats-hint]")) {
    element.addEventListener("pointerenter", () => schedule(element), options);
    element.addEventListener("pointerleave", hide, options);
    element.addEventListener("focusin", () => schedule(element), options);
    element.addEventListener("focusout", hide, options);
  }
  doc.addEventListener("keydown", event => { if (event.key === "Escape") hide(); }, options);
  doc.addEventListener("scroll", hide, { ...options, capture: true });
  view.addEventListener("resize", hide, options);
  return () => { hide(); controller.abort(); };
}
