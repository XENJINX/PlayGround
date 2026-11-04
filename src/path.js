// Rounded, uniformly sampled enemy track.
// The path is built once and queried by distance for smooth movement.

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function norm(a, b) {
  const d = dist(a, b) || 1;
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
}

export function buildPath(verts, cornerRadius = 54, step = 5) {
  const raw = [];
  const push = (p) => {
    const last = raw[raw.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.001) raw.push(p);
  };

  const lineTo = (from, to) => {
    const length = dist(from, to);
    const n = Math.max(1, Math.ceil(length / step));
    for (let i = 1; i <= n; i += 1) {
      const t = i / n;
      push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    }
  };

  const quadTo = (a, c, b) => {
    const approx = dist(a, c) + dist(c, b);
    const n = Math.max(4, Math.ceil(approx / step));
    let prev = a;
    for (let i = 1; i <= n; i += 1) {
      const t = i / n;
      const it = 1 - t;
      const p = {
        x: it * it * a.x + 2 * it * t * c.x + t * t * b.x,
        y: it * it * a.y + 2 * it * t * c.y + t * t * b.y,
      };
      lineTo(prev, p);
      prev = p;
    }
  };

  push(verts[0]);
  for (let i = 1; i < verts.length - 1; i += 1) {
    const prev = verts[i - 1];
    const cur = verts[i];
    const next = verts[i + 1];
    const inDir = norm(prev, cur);
    const outDir = norm(cur, next);
    const r = Math.min(cornerRadius, dist(prev, cur) / 2, dist(cur, next) / 2);
    const p1 = { x: cur.x - inDir.x * r, y: cur.y - inDir.y * r };
    const p2 = { x: cur.x + outDir.x * r, y: cur.y + outDir.y * r };
    const end = raw[raw.length - 1];
    if (end) lineTo(end, p1);
    quadTo(p1, cur, p2);
  }
  const last = raw[raw.length - 1];
  const final = verts[verts.length - 1];
  if (last) lineTo(last, final);

  // Cumulative lengths.
  const points = [];
  const cumulative = [0];
  for (let i = 0; i < raw.length; i += 1) {
    const prev = raw[i - 1];
    if (prev) cumulative.push(cumulative[i - 1] + dist(prev, raw[i]));
    points.push(raw[i]);
  }

  const length = cumulative[cumulative.length - 1] || 1;

  function sample(distance) {
    const d = Math.max(0, Math.min(length, distance));
    let lo = 0;
    let hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] <= d) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const a = points[i - 1];
    const b = points[i] || points[i - 1];
    const seg = cumulative[i] - cumulative[i - 1] || 1;
    const t = (d - cumulative[i - 1]) / seg;
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      distance: d,
    };
  }

  return { points, cumulative, length, sample };
}
