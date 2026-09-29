// Badge de tournage suspendu à une lanière — port en JS natif du composant « Lanyard Badge ».
// La lanière est une corde verlet dessinée en ruban texturé sur un canvas 2D ; la carte est du
// HTML tourné en 3D par CSS, donc recto et verso se modifient directement dans index.html.
// Glisser la carte tend la lanière, un geste de côté la fait tourner, un clic (ou Entrée) la retourne.

const STEP = 1 / 120;
const GRAVITY = 2400;
const ITER = 18;

// ---------- physique ----------
/** Pas de Verlet. `w` est l'inverse de la masse ; 0 fige le point. */
function integrate(pts, dt, gravity, damping) {
  for (const p of pts) {
    if (!p.w) continue;
    const vx = (p.x - p.px) * damping, vy = (p.y - p.py) * damping;
    p.px = p.x; p.py = p.y;
    p.x += vx; p.y += vy + gravity * dt * dt;
  }
}
/** Relâche les contraintes de distance, les points lourds bougeant moins. */
function solve(pts, links, iterations) {
  for (let k = 0; k < iterations; k++) {
    for (const [i, j, rest] of links) {
      const a = pts[i], b = pts[j], ws = a.w + b.w;
      if (!ws) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const f = (d - rest) / (d * ws);
      a.x += dx * f * a.w; a.y += dy * f * a.w;
      b.x -= dx * f * b.w; b.y -= dy * f * b.w;
    }
  }
}
/** Rotation de la carte sur l'anneau : la torsion de la lanière la ramène vers `target`. */
function spinStep(s, target, dt, drive) {
  s.v += (-(s.a - target) * 18 - s.v * 3.2 + drive) * dt;
  s.a += s.v * dt;
}
const swingAngle = (top, bottom) => Math.atan2(bottom.x - top.x, bottom.y - top.y);

// ---------- impression de la lanière (DA du portfolio) ----------
// l'étoile du site, polygone 100×100
const STAR = [50, 0, 57, 38, 88, 12, 63, 45, 100, 50, 63, 55, 88, 88, 57, 62, 50, 100, 43, 62, 12, 88, 37, 55, 0, 50, 37, 45, 12, 12, 43, 38];
function star(ctx, cx, cy, size) {
  ctx.beginPath();
  for (let i = 0; i < STAR.length; i += 2) {
    const x = cx + (STAR[i] / 100 - 0.5) * size, y = cy + (STAR[i + 1] / 100 - 0.5) * size;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath(); ctx.fill();
}

/** La lanière imprimée, `length` px CSS de long, posée le long de la hauteur du canvas. */
function makeStrap(length, width, dpr, { strap, print, accent, plain }) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(width * dpr));
  c.height = Math.max(1, Math.round(length * dpr));
  const ctx = c.getContext('2d');
  // repère de la lanière : x descend le long de la sangle, y la traverse
  ctx.setTransform(0, dpr, -dpr, 0, c.width, 0);
  ctx.fillStyle = strap;
  ctx.fillRect(0, 0, length, width);

  if (!plain) {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, length, width); ctx.clip();
    ctx.textBaseline = 'middle';
    const big = `${Math.round(width * 0.66)}px Anton, Impact, sans-serif`;
    const small = `500 ${Math.round(width * 0.3)}px "IBM Plex Mono", "Courier New", monospace`;
    const name = 'TOM CARVALHO', tag = 'VIDÉASTE · PARIS · 2026';
    ctx.font = big; const nameW = ctx.measureText(name).width;
    const gap = width * 0.7;
    let x = width * 0.5;
    while (x < length) {
      ctx.fillStyle = accent; star(ctx, x + width * 0.4, width * 0.5, width * 0.8); x += width * 0.8 + gap;
      ctx.fillStyle = print; ctx.font = big; ctx.fillText(name, x, width * 0.54); x += nameW + gap;
      ctx.fillStyle = accent; star(ctx, x + width * 0.2, width * 0.5, width * 0.42); x += width * 0.42 + gap;
      ctx.fillStyle = print; ctx.font = small;
      // lettres espacées à la main : letterSpacing n'existe pas partout sur canvas
      for (const ch of tag) { ctx.fillText(ch, x, width * 0.52); x += ctx.measureText(ch).width * 1.25; }
      x += gap;
    }
    ctx.restore();
  }
  // les tranches tissées accrochent un peu la lumière
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = print; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 1.5); ctx.lineTo(length, 1.5);
  ctx.moveTo(0, width - 1.5); ctx.lineTo(length, width - 1.5);
  ctx.stroke();
  return c;
}

const SHADES = Array.from({ length: 101 }, (_, i) => `rgba(0,0,0,${(i / 100).toFixed(2)})`);

const rr = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
};

// ============================================================
export function mountBadge(root, anchor = null) {
  const canvas = root.querySelector('.badge-strap');
  const card = root.querySelector('.badge-card');
  const inner = root.querySelector('.badge-inner');
  const front = root.querySelector('.badge-front');
  const back = root.querySelector('.badge-back');
  const flipBtn = root.querySelector('.badge-flip');
  const ctx = canvas?.getContext('2d');
  if (!ctx || !card || !inner) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LOOK = { strap: '#e3170a', print: '#0a0a0a', accent: '#f1efea' };
  const N = 14;

  let cw = 0, ch = 0, ringR = 0, clipH = 0, sw = 0, lowLen = 0, arm = 0;
  let pts = [], links = [], left = [], right = [], low = [];
  let iB = 0, iT = 0, iC = 0, strandRest = 1;
  let dpr = 1, W = 0, H = 0, strapTex = null, plainTex = null;
  const spin = { a: 0, v: 0 };
  let spinTarget = 0;

  const add = (x, y, w) => { pts.push({ x, y, px: x, py: y, w }); return pts.length - 1; };
  const strand = (from, to, n, slack) => {
    const a = pts[from], b = pts[to];
    const rest = (Math.hypot(b.x - a.x, b.y - a.y) * slack) / n;
    const ids = [from];
    for (let i = 1; i < n; i++) ids.push(add(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n, 1));
    ids.push(to);
    for (let i = 0; i < n; i++) links.push([ids[i], ids[i + 1], rest]);
    return { ids, rest };
  };

  // taille de la carte selon la largeur de la scène ; tout le contenu est en em (1em = cw/24)
  function size() {
    cw = (anchor || root).clientWidth < 420 ? 232 : 300;
    ch = Math.round(cw * 1.5);
    ringR = Math.max(7, Math.round(cw * 0.036));
    clipH = Math.round(cw * 0.1);
    sw = Math.max(14, Math.round(cw * 0.1));
    lowLen = sw * 2.2;
    arm = ringR * 2 + clipH + ch * 0.55;
    card.style.width = `${cw}px`;
    card.style.height = `${ch + ringR + clipH}px`;
    card.style.fontSize = `${cw / 24}px`;
    inner.style.top = `${ringR + clipH * 0.6}px`;
    inner.style.height = `${ch}px`;
  }

  function build() {
    size();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(1, root.clientWidth); H = Math.max(1, root.clientHeight);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    pts = []; links = [];
    // zone d'accroche : le repère de la colonne gauche (toute la scène à défaut)
    const rb = root.getBoundingClientRect();
    const ab = anchor ? anchor.getBoundingClientRect() : rb;
    const ax = ab.left - rb.left, ay = ab.top - rb.top, AW = Math.max(1, ab.width), AH = Math.max(1, ab.height);
    // sur mobile, l'accroche passe à droite : l'étiquette de section reste lisible en haut à gauche
    const cx = ax + AW * (W <= 900 ? 0.68 : 0.5);
    const spread = Math.min(AW * 0.16, cw * 0.55);
    const top = ay - sw * 2;
    // la boucle est placée pour que toute la carte tienne dans la zone d'accroche
    const bY = ay + Math.max(AH * 0.14, Math.min(AH * 0.42, AH - (lowLen + ringR * 2 + clipH + ch) - 40));
    const aL = add(cx - spread, top, 0);
    iB = add(cx, bY, 1.4);
    const l = strand(aL, iB, N, 1.03);
    const aR = add(cx + spread, top, 0);
    const r = strand(aR, iB, N, 1.03);
    iT = add(cx, bY + lowLen, 0.8);
    const lo = strand(iB, iT, 3, 1);
    iC = add(cx, bY + lowLen + arm, 0.25);
    links.push([iT, iC, arm]);
    left = l.ids; right = r.ids; low = lo.ids; strandRest = l.rest;
    strapTex = makeStrap(strandRest * N + 4, sw, dpr, LOOK);
    plainTex = makeStrap(lowLen + 4, sw * 0.8, dpr, { ...LOOK, plain: true });
    makeSprites();
    // la scène démarre au repos ; l'élan est donné quand la section entre à l'écran
    spin.a = spinTarget; spin.v = 0;
    for (let i = 0; i < 600; i++) { integrate(pts, STEP, GRAVITY, 0.98); solve(pts, links, ITER); }
    for (const p of pts) { p.px = p.x; p.py = p.y; }
  }

  // comme si quelqu'un venait de lâcher le badge
  function letGo() {
    if (reduced) return;
    pts[iC].x += cw * 0.55; pts[iC].px = pts[iC].x - 2;
    spin.v = 5;
  }

  // ---------- dessin ----------
  function ribbon(ids, tex, rest, light) {
    const Wt = tex.width;
    for (let i = 0; i < ids.length - 1; i++) {
      const a = pts[ids[i]], b = pts[ids[i + 1]];
      const dx = (b.x - a.x) * dpr, dy = (b.y - a.y) * dpr;
      const len = Math.hypot(dx, dy) || 1e-6;
      const tx = dx / len, ty = dy / len;
      // le haut des lettres regarde +n : cet appariement garde l'impression lisible, pas en miroir
      const nx = ty, ny = -tx;
      const v0 = i * rest * dpr, dv = rest * dpr, k = len / dv;
      ctx.setTransform(nx, ny, tx * k, ty * k, a.x * dpr - (nx * Wt) / 2 - tx * k * v0, a.y * dpr - (ny * Wt) / 2 - ty * k * v0);
      // +1,5 chevauche la tranche suivante : aucun liseré dans les courbes
      const src = Math.min(dv + 1.5, tex.height - v0);
      if (src > 0) ctx.drawImage(tex, 0, v0, Wt, src, 0, v0, Wt, src);
      // un brin tourné à l'opposé de la lumière paraît plus sombre, ça vend la 3D
      const shade = 0.26 * (1 - Math.max(0, nx * light));
      ctx.fillStyle = SHADES[Math.round(shade * 100)];
      ctx.fillRect(0, v0, Wt, dv + 1);
    }
  }
  const metal = (c, x0, y0, x1, y1) => {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, '#ecebe7'); g.addColorStop(0.45, '#a3a09a');
    g.addColorStop(0.55, '#6f6c67'); g.addColorStop(1, '#dedcd6');
    return g;
  };
  // la boucle et l'anneau sont rendus une fois en sprites (l'ombre floutée coûte cher image par image)
  let buckle = null, ring = null;
  function makeSprites() {
    const u = sw / 20, pad = 10 * u;
    const bw = 30 * u + 2 * pad, bh = 31 * u + 2 * pad;
    buckle = { c: document.createElement('canvas'), ox: 15 * u + pad, oy: 14 * u + pad, w: bw, h: bh };
    buckle.c.width = Math.ceil(bw * dpr); buckle.c.height = Math.ceil(bh * dpr);
    const b = buckle.c.getContext('2d');
    b.setTransform(dpr, 0, 0, dpr, buckle.ox * dpr, buckle.oy * dpr);
    b.shadowColor = 'rgba(0,0,0,0.5)'; b.shadowBlur = 6 * dpr; b.shadowOffsetY = 2 * dpr;
    b.fillStyle = metal(b, -16 * u, 0, 16 * u, 0);
    rr(b, -15 * u, -14 * u, 30 * u, 17 * u, 3 * u); b.fill();
    rr(b, -11 * u, 1 * u, 22 * u, 15 * u, [2 * u, 2 * u, 6 * u, 6 * u]); b.fill();
    b.shadowColor = 'transparent';
    b.fillStyle = 'rgba(20,20,20,0.6)';
    b.fillRect(-10 * u, -9 * u, 20 * u, 2.2 * u);
    b.fillRect(-5 * u, 6 * u, 10 * u, 3 * u);
    b.strokeStyle = 'rgba(255,255,255,0.6)'; b.lineWidth = 0.8 * u;
    b.beginPath(); b.moveTo(-13 * u, -12.5 * u); b.lineTo(13 * u, -12.5 * u); b.stroke();

    const lw = Math.max(2.5, ringR * 0.38), rs = ringR + lw;
    ring = { c: document.createElement('canvas'), o: rs, w: rs * 2 };
    ring.c.width = ring.c.height = Math.ceil(rs * 2 * dpr);
    const r = ring.c.getContext('2d');
    r.setTransform(dpr, 0, 0, dpr, rs * dpr, rs * dpr);
    r.lineWidth = lw; r.strokeStyle = metal(r, -ringR, -ringR, ringR, ringR);
    r.beginPath(); r.arc(0, 0, ringR, 0, Math.PI * 2); r.stroke();
  }
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!strapTex || !plainTex || !buckle) return;
    ctx.imageSmoothingEnabled = true;
    ribbon(left, strapTex, strandRest, -1);
    ribbon(right, strapTex, strandRest, 1);
    ribbon(low, plainTex, lowLen / 3, 0);

    // boucle à clip, tournée dans l'axe de la sangle courte
    const B = pts[iB], T = pts[iT];
    const ang = Math.atan2(T.x - B.x, T.y - B.y);
    ctx.setTransform(dpr, 0, 0, dpr, B.x * dpr, B.y * dpr);
    ctx.rotate(-ang);
    ctx.drawImage(buckle.c, -buckle.ox, -buckle.oy, buckle.w, buckle.h);

    // anneau brisé
    ctx.setTransform(dpr, 0, 0, dpr, T.x * dpr, (T.y + ringR * 0.8) * dpr);
    ctx.drawImage(ring.c, -ring.o, -ring.o, ring.w, ring.w);
  }
  function place() {
    const T = pts[iT], C = pts[iC];
    const swing = swingAngle(T, C);
    card.style.transform = `translate3d(${(T.x - cw / 2).toFixed(2)}px,${(T.y + ringR).toFixed(2)}px,0) rotate(${(-swing).toFixed(4)}rad)`;
    inner.style.transform = `perspective(1100px) rotateY(${spin.a.toFixed(4)}rad)`;
    const edge = 1 - Math.abs(Math.cos(spin.a));
    inner.style.setProperty('--lyd-dim', (edge * 0.5).toFixed(3));
    inner.style.setProperty('--lyd-shine', `${(50 + Math.sin(spin.a) * 70 + swing * 90).toFixed(1)}%`);
  }

  // ---------- retourner ----------
  function flip() {
    spinTarget = spinTarget === 0 ? Math.PI : 0;
    const showBack = spinTarget !== 0;
    card.setAttribute('aria-pressed', String(showBack));
    front?.setAttribute('aria-hidden', String(showBack));
    back?.setAttribute('aria-hidden', String(!showBack));
    if (flipBtn) {
      flipBtn.setAttribute('aria-pressed', String(showBack));
      flipBtn.querySelector('span').textContent = showBack ? 'Voir le recto' : 'Voir le verso';
    }
    run();
  }
  flipBtn?.addEventListener('click', flip);
  card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });

  // ---------- attraper la carte ----------
  let drag = null;
  const local = e => { const r = root.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  card.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    const [x, y] = local(e);
    const T = pts[iT];
    drag = { id: e.pointerId, ox: T.x - x, oy: T.y - y, tx: T.x, ty: T.y, sx: x, sy: y, moved: false };
    pts[iT].w = 0;
    card.setPointerCapture(e.pointerId);
    card.classList.add('is-grabbing');
    run();
  });
  card.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const [x, y] = local(e);
    drag.tx = x + drag.ox; drag.ty = y + drag.oy;
    if (Math.hypot(x - drag.sx, y - drag.sy) > 5) drag.moved = true;
  });
  const up = e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) flip();
    drag = null;
    pts[iT].w = 0.8;
    card.classList.remove('is-grabbing');
  };
  card.addEventListener('pointerup', up);
  card.addEventListener('pointercancel', up);

  // ---------- boucle : uniquement quand la scène est visible ----------
  let raf = 0, acc = 0, last = 0, t = 0, inView = false, visible = !document.hidden, started = false;
  function tick(now) {
    acc += Math.min(0.05, (now - last) / 1000);
    last = now;
    let steps = 0;
    while (acc >= STEP && steps < 8) {
      acc -= STEP; steps++; t += STEP;
      if (drag) {
        const T = pts[iT];
        T.px = T.x; T.py = T.y;
        T.x += (drag.tx - T.x) * 0.35; T.y += (drag.ty - T.y) * 0.35;
      }
      const C = pts[iC];
      // un courant d'air sur le plateau : le badge n'est jamais tout à fait immobile
      if (!reduced && !drag) C.x += (22 * Math.sin(t * 0.7) + 12 * Math.sin(t * 1.9)) * STEP * STEP;
      integrate(pts, STEP, GRAVITY, 0.992);
      solve(pts, links, ITER);
      const vx = (C.x - C.px) / STEP;
      spinStep(spin, spinTarget, STEP, vx * 0.03 + (reduced ? 0 : 0.6 * Math.sin(t * 0.5)));
    }
    draw(); place();
    raf = requestAnimationFrame(tick);
  }
  function run() {
    if (raf || !inView || !visible) return;
    last = performance.now(); acc = 0;
    raf = requestAnimationFrame(tick);
  }
  function halt() { cancelAnimationFrame(raf); raf = 0; }

  build(); draw(); place();

  new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    if (!inView) { halt(); return; }
    if (!started) { started = true; letGo(); }
    run();
  }, { threshold: 0.2 }).observe(root);
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible) run(); else halt(); });
  let aw = anchor?.clientWidth || 0, ah = anchor?.clientHeight || 0;
  const ro = new ResizeObserver(() => {
    const nw = anchor?.clientWidth || 0, nh = anchor?.clientHeight || 0;
    if (Math.abs(root.clientWidth - W) < 1 && Math.abs(root.clientHeight - H) < 1 && nw === aw && nh === ah) return;
    aw = nw; ah = nh;
    build(); draw(); place();
  });
  ro.observe(root);
  if (anchor) ro.observe(anchor);
}
