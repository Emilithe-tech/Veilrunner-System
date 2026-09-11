/** Scale the fixed hero layout relative to the author's 3440 x 1417 viewport.
 * Width only limits the scale when the sheet would otherwise cross the viewport.
 * Dimensions are CSS pixels, so browser zoom and OS display scaling are included.
 */
export function fitHeroViewport(position, viewport, requested = position) {
  const { width, height } = viewport;
  if (!(width > 0 && height > 0)) return position;
  const sheetWidth = Number(position.width);
  const sheetHeight = Number(position.height);
  if (!(sheetWidth > 0 && sheetHeight > 0)) return position;
  const scale = Math.min(height / 1417, width / sheetWidth, height / sheetHeight);
  const maxLeft = Math.max(0, width - sheetWidth * scale);
  const maxTop = Math.max(0, height - sheetHeight * scale);
  return {
    ...position,
    scale,
    left: Math.max(0, Math.min(requested.left ?? maxLeft / 2, maxLeft)),
    top: Math.max(0, Math.min(requested.top ?? maxTop / 2, maxTop))
  };
}
