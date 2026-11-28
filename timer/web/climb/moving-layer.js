// A moving layer occupies the same SVG stacking position and coordinate
// system as its retained vector artwork.
export function movingLayer(group, marker) {
  const doc = group.ownerDocument, win = doc.defaultView;
  if (!win?.SVGForeignObjectElement) return null;
  const layer = doc.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
  const canvas = doc.createElement('canvas'), ctx = canvas.getContext?.('2d');
  if (!ctx) return null;
  layer.setAttribute(marker, '');
  layer.style.pointerEvents = 'none';
  canvas.style.cssText = 'display:block;width:100%;height:100%';
  layer.appendChild(canvas);
  group.after(layer);
  let cssWidth = 0, cssHeight = 0;
  return { layer, begin(width, height, ratio) {
    const w = Math.max(1, Math.round(width * ratio)), h = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== w || canvas.height !== h || cssWidth !== width || cssHeight !== height) {
      cssWidth = width; cssHeight = height;
      canvas.width = w; canvas.height = h;
      layer.setAttribute('width', width); layer.setAttribute('height', height);
      ctx.setTransform(w / width, 0, 0, h / height, 0, 0);
      ctx.lineJoin = 'round';
    }
    ctx.clearRect(0, 0, width, height);
    return ctx;
  }};
}
