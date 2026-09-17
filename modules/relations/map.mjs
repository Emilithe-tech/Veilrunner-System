/** Grid geometry is generated locally; no Scene is changed. Foundry grid IDs 0–5. */
export function mapGrid(map) {
  const { width, height, gridType: type, gridSize: size } = map;
  if (!type || !Number.isFinite(size) || size < 10) return [];
  const paths = [];
  if (type === 1) {
    for (let x = 0; x <= width; x += size) paths.push('M' + x + ',0V' + height);
    for (let y = 0; y <= height; y += size) paths.push('M0,' + y + 'H' + width);
  } else {
    const columns = type >= 4, radius = size / Math.sqrt(3), stride = radius * 1.5;
    const majorLimit = columns ? width : height, minorLimit = columns ? height : width;
    for (let major = 0; major * stride < majorLimit + radius; major++) {
      const offset = (major % 2 === (type % 2 ? 0 : 1)) ? size / 2 : 0;
      for (let minor = -1; minor * size < minorLimit + size; minor++) {
        const cx = columns ? major * stride : minor * size + offset;
        const cy = columns ? minor * size + offset : major * stride;
        const points = Array.from({ length: 6 }, (_, index) => {
          const angle = (index * 60 + (columns ? 0 : 30)) * Math.PI / 180;
          return (cx + radius * Math.cos(angle)).toFixed(3) + ',' + (cy + radius * Math.sin(angle)).toFixed(3);
        });
        paths.push('M' + points.join('L') + 'Z');
        if (paths.length >= 20000) return paths;
      }
    }
  }
  return paths;
}
