// Proposition 2 « Projection » — amorce, showreel tramé dans les lettres, pellicule, nav, lecteur.
import { safeURL } from '../js/media-url.mjs';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canHover = matchMedia('(hover: hover)').matches;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const tc = s => `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(Math.floor(s) % 60)}:${pad(Math.floor((s % 1) * 25))}`;

// ---------- données de l'admin (repli statique si le JSON est injoignable) ----------
const FALLBACK = [
  { titre: 'V8 Vantage — In Paris', type: 'Film', video: 'https://res.cloudinary.com/x59xsxis/video/upload/f_mp4,vc_h264,q_auto/v1788879482/portfolio-tom/video/3b2ca037-ae4f-4621-baa1-0974bf9d5247.mp4', image: 'https://res.cloudinary.com/x59xsxis/video/upload/so_0,f_jpg,q_auto,w_1600,c_limit/v1788879482/portfolio-tom/video/3b2ca037-ae4f-4621-baa1-0974bf9d5247.jpg' },
  { titre: 'Nicolas Joffre — Le Mans Classic', type: 'Film', video: 'https://res.cloudinary.com/x59xsxis/video/upload/f_mp4,vc_h264,q_auto/v1788880224/portfolio-tom/video/31aebd08-c6c2-41c0-8ef2-bceb40af86d5.mp4', image: 'https://res.cloudinary.com/x59xsxis/video/upload/so_0,f_jpg,q_auto,w_1600,c_limit/v1788880224/portfolio-tom/video/31aebd08-c6c2-41c0-8ef2-bceb40af86d5.jpg' },
  { titre: 'Nicolas Joffre — Les origines', type: 'Film', video: 'https://res.cloudinary.com/x59xsxis/video/upload/f_mp4,vc_h264,q_auto/v1788887854/portfolio-tom/video/6d10d3b9-c0d1-4af4-a59c-8999c6484702.mp4', image: 'https://res.cloudinary.com/x59xsxis/video/upload/so_0,f_jpg,q_auto,w_1600,c_limit/v1788887854/portfolio-tom/video/6d10d3b9-c0d1-4af4-a59c-8999c6484702.jpg' }
];
async function loadProjects() {
  try {
    const r = await fetch('/data/accueil.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    if (Array.isArray(d.projets) && d.projets.length) return d.projets;
  } catch { /* ouvert en local ou JSON absent : repli */ }
  return FALLBACK;
}

// ---------- amorce 3·2·1 : une fois par session, jamais si l'utilisateur limite les animations ----------
const leader = document.querySelector('.leader');
const ready = () => document.body.classList.add('is-ready');
let seen = false;
try { seen = sessionStorage.getItem('tom-leader') === '1'; } catch { /* stockage indisponible : on joue l'amorce */ }
if (reduced || seen) { leader.classList.add('is-off'); ready(); }
else {
  const num = leader.querySelector('.leader-num');
  let n = 3;
  const tick = setInterval(() => {
    n -= 1;
    if (n >= 1) { num.textContent = n; return; }
    clearInterval(tick);
    leader.classList.add('is-done'); ready();
    try { sessionStorage.setItem('tom-leader', '1'); } catch { /* sans importance */ }
    setTimeout(() => leader.classList.add('is-off'), 700);
  }, 450);
}

// ---------- reveals ----------
const io = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: 0.12 });
const reveal = (root = document) => root.querySelectorAll('.sr:not(.in)').forEach(el => io.observe(el));
reveal();

// ---------- nav : blanche sur les blocs noirs ----------
const nav = document.querySelector('nav');
const darkBlocks = [...document.querySelectorAll('.credits, footer')];
function navTheme() {
  const y = scrollY + 40;
  nav.classList.toggle('on-dark', darkBlocks.some(s => y >= s.offsetTop && y < s.offsetTop + s.offsetHeight));
}
addEventListener('scroll', navTheme, { passive: true });

// ============================================================
// HERO — le showreel joue dans les lettres, en trame de points rouges
// ============================================================
function mountHero(reelSrc, poster) {
  const hero = document.querySelector('.hero');
  const cv = document.querySelector('.hero-canvas');
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  hero.classList.add('has-canvas');
  const tcEl = document.querySelector('.hero-tc');

  // source : vidéo (ou image fixe si l'utilisateur limite les animations)
  let src = null, srcW = 0, srcH = 0;
  if (reduced || !reelSrc) {
    const img = new Image(); img.crossOrigin = 'anonymous';
    if (poster) { img.src = poster; img.onload = () => { src = img; srcW = img.naturalWidth; srcH = img.naturalHeight; draw(); }; }
  } else {
    const v = document.createElement('video');
    v.muted = true; v.loop = true; v.playsInline = true; v.crossOrigin = 'anonymous'; v.preload = 'auto';
    if (poster) v.poster = poster;
    v.src = reelSrc;
    v.addEventListener('loadeddata', () => { src = v; srcW = v.videoWidth; srcH = v.videoHeight; v.play().catch(() => {}); });
    v.addEventListener('error', () => { src = null; draw(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) v.pause(); else if (src === v) v.play().catch(() => {}); });
  }

  // petit canvas d'échantillonnage : une cellule de trame = un pixel
  const sm = document.createElement('canvas');
  const sctx = sm.getContext('2d', { willReadFrequently: true });
  // masque des lettres : dessiné une fois par mise en page, appliqué en une seule opération
  // (destination-in intersecte à chaque appel : deux fillText successifs donneraient le vide)
  const mask = document.createElement('canvas');
  const mctx = mask.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  let W = 0, H = 0, cell = 12, cols = 0, rows = 0, lines = [], tainted = false;
  const mouse = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, on: false };

  function layout() {
    W = hero.clientWidth; H = hero.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cell = Math.max(7, Math.round(Math.min(W, H) / 64));
    cols = Math.ceil(W / cell); rows = Math.ceil(H / cell);
    sm.width = cols; sm.height = rows;
    // deux lignes, TOM puis CARVALHO, chacune sur 90 % de la largeur ; bloc centré
    ctx.font = '100px Anton';
    // Anton : hauteur de capitale ≈ 0,84 em ; le bloc reste entre la nav et les infos du bas
    const target = W * 0.9, cap = 0.84, gap = 0.2;
    let fT = 100 * target / ctx.measureText('TOM').width;
    let fC = 100 * target / ctx.measureText('CARVALHO').width;
    let block = fT * cap + fC * gap + fC * cap;
    const maxH = H * 0.62;
    if (block > maxH) { const k = maxH / block; fT *= k; fC *= k; block = maxH; }
    let y = H * 0.5 - block / 2 + fT * cap;
    lines = [{ t: 'TOM', f: fT, y }, { t: 'CARVALHO', f: fC, y: y + fC * gap + fC * cap }];
    mask.width = cv.width; mask.height = cv.height;
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0); mctx.clearRect(0, 0, W, H);
    mctx.fillStyle = '#000'; mctx.textAlign = 'center'; mctx.textBaseline = 'alphabetic';
    lines.forEach(l => { mctx.font = `${l.f}px Anton`; mctx.fillText(l.t, W / 2, l.y); });
    draw();
  }

  function cover(target, w, h) {
    const s = Math.max(w / srcW, h / srcH);
    const dw = srcW * s, dh = srcH * s;
    target.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  function text(fill) {
    ctx.fillStyle = fill; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    lines.forEach(l => { ctx.font = `${l.f}px Anton`; ctx.fillText(l.t, W / 2, l.y); });
  }

  let raf = 0, last = 0, visible = true, inView = true;
  function draw(now = 0) {
    raf = 0;
    if (!W) return;
    ctx.clearRect(0, 0, W, H);
    if (!src || !srcW) { text('#e3170a'); return; }

    // 1. la trame : un point rouge par cellule, gros là où l'image est claire
    let data = null;
    if (!tainted) {
      try { cover(sctx, cols, rows); data = sctx.getImageData(0, 0, cols, rows).data; }
      catch { tainted = true; }
    }
    if (data) {
      // contour fin sous la trame : les lettres restent lisibles même sur un fondu au noir
      ctx.save(); ctx.globalAlpha = 0.45; ctx.lineWidth = 1.5; ctx.strokeStyle = '#e3170a'; ctx.lineJoin = 'round';
      lines.forEach(l => { ctx.font = `${l.f}px Anton`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.strokeText(l.t, W / 2, l.y); });
      ctx.restore();
      const path = new Path2D();
      const maxR = cell * 0.56;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 4;
        const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
        // rayon plancher de 20 % : une image noire donne une trame fine, jamais le vide
        const rad = maxR * (0.2 + 0.8 * Math.pow(lum, 0.8));
        const x = c * cell + cell / 2 + (r % 2 ? cell / 2 : 0);
        path.moveTo(x + rad, r * cell + cell / 2);
        path.arc(x, r * cell + cell / 2, rad, 0, Math.PI * 2);
      }
      ctx.fillStyle = '#e3170a'; ctx.fill(path);
    } else {
      // canvas « tainted » (pas de CORS) : image N&B teintée rouge, sans trame
      ctx.save(); ctx.filter = 'grayscale(1) contrast(1.3)'; cover(ctx, W, H); ctx.restore();
      ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(227,23,10,.82)'; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }

    // 2. la loupe : sous le curseur, l'image nette en noir et blanc
    if (mouse.on) {
      mouse.x += (mouse.tx - mouse.x) * 0.18; mouse.y += (mouse.ty - mouse.y) * 0.18;
      const R = Math.min(W, H) * 0.22;
      ctx.save(); ctx.beginPath(); ctx.arc(mouse.x, mouse.y, R, 0, Math.PI * 2); ctx.clip();
      ctx.filter = 'grayscale(1) contrast(1.35)'; cover(ctx, W, H); ctx.restore();
    }

    // 3. tout ça découpé par les lettres
    ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(mask, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';

    if (src.tagName === 'VIDEO' && tcEl && now - last > 120) { tcEl.textContent = tc(src.currentTime); last = now; }
    if (src.tagName === 'VIDEO' && visible && inView) raf = requestAnimationFrame(draw);
  }
  const kick = () => { if (!raf && visible && inView) raf = requestAnimationFrame(draw); };

  hero.addEventListener('pointermove', e => {
    if (!canHover) return;
    const b = hero.getBoundingClientRect();
    mouse.tx = e.clientX - b.left; mouse.ty = e.clientY - b.top;
    if (!mouse.on) { mouse.x = mouse.tx; mouse.y = mouse.ty; mouse.on = true; }
    kick();
  });
  hero.addEventListener('pointerleave', () => { mouse.on = false; kick(); });
  new ResizeObserver(layout).observe(hero);
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; if (inView) kick(); else if (raf) { cancelAnimationFrame(raf); raf = 0; } }).observe(hero);
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; kick(); });
  document.fonts?.load('100px Anton').then(layout).catch(layout);
  const kicker = setInterval(() => { if (src) { kick(); clearInterval(kicker); } }, 200);
  return true;
}

// ============================================================
// PELLICULE — la bande défile horizontalement au scroll vertical
// ============================================================
function mountReel(projets) {
  const reel = document.querySelector('.reel');
  const strip = reel.querySelector('.strip');
  const cur = reel.querySelector('.cur'); const tot = reel.querySelector('.tot');
  tot.textContent = pad(projets.length);

  strip.innerHTML = projets.map((p, i) => {
    const video = safeURL(p.video), image = safeURL(p.image, { image: true }), link = safeURL(p.lien);
    const media = video
      ? `<video src="${esc(video)}" ${image ? `poster="${esc(image)}"` : ''} preload="metadata" muted loop playsinline aria-hidden="true"></video>`
      : `<img src="${esc(image)}" alt="" loading="lazy">`;
    const href = link || video || '#fin';
    return `<a class="frame" data-i="${i}" ${video ? 'data-play="true"' : ''} href="${esc(href)}" ${link ? 'target="_blank" rel="noopener noreferrer"' : ''} aria-label="${esc(p.titre)}">
      ${media}<span class="idx">${pad(i + 1)}</span>${video || link ? '<span class="play" aria-hidden="true"></span>' : ''}
      <span class="meta"><h3>${esc(p.titre)}</h3><span>${esc(p.type || 'Film')}</span></span>
    </a>`;
  }).join('') + '<p class="frame-end">Un projet en tête ?<br><a href="#fin">Écris-moi →</a></p>';

  const frames = [...strip.querySelectorAll('.frame')];
  let active = -1;
  function setActive(i) {
    if (i === active) return;
    active = i; cur.textContent = pad(i + 1);
    frames.forEach((f, k) => {
      f.classList.toggle('is-on', k === i);
      const v = f.querySelector('video'); if (!v) return;
      if (k === i && !reduced) v.play().catch(() => {}); else v.pause();
    });
  }

  const desktop = () => innerWidth > 900;
  let travel = 0;
  function measure() {
    if (!desktop()) { reel.style.height = ''; strip.style.transform = ''; return; }
    travel = Math.max(0, strip.scrollWidth - innerWidth);
    reel.style.height = `${innerHeight + travel}px`;
    update();
  }
  function update() {
    if (desktop()) {
      const p = Math.min(1, Math.max(0, (scrollY - reel.offsetTop) / Math.max(1, reel.offsetHeight - innerHeight)));
      strip.style.transform = `translate3d(${-p * travel}px,0,0)`;
      // photogramme le plus proche du centre de l'écran
      let best = 0, bd = Infinity;
      frames.forEach((f, k) => { const r = f.getBoundingClientRect(); const d = Math.abs(r.left + r.width / 2 - innerWidth / 2); if (d < bd) { bd = d; best = k; } });
      setActive(best);
    } else {
      let best = 0, bd = Infinity;
      frames.forEach((f, k) => { const r = f.getBoundingClientRect(); const d = Math.abs(r.top + r.height / 2 - innerHeight / 2); if (d < bd) { bd = d; best = k; } });
      setActive(best);
    }
    navTheme();
  }
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', measure);
  frames.forEach(f => f.querySelector('video')?.addEventListener('loadedmetadata', measure));
  measure(); setActive(0);
  return frames;
}

// ---------- lecteur plein cadre ----------
function mountPlayer(frames) {
  const dialog = document.createElement('dialog'); dialog.className = 'portfolio-video-dialog';
  dialog.innerHTML = '<button type="button" class="video-close" aria-label="Fermer la vidéo">Fermer ×</button><video controls playsinline preload="metadata"></video><p class="video-error" role="status" hidden>La vidéo est indisponible ou en cours de préparation. Réessaie dans un instant.</p>';
  document.body.append(dialog);
  const player = dialog.querySelector('video');
  dialog.querySelector('button').onclick = () => dialog.close();
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { player.pause(); player.removeAttribute('src'); player.load(); });
  player.addEventListener('error', () => { if (player.hasAttribute('src')) dialog.querySelector('.video-error').hidden = false; });
  frames.forEach(f => {
    if (!f.dataset.play) return;
    f.addEventListener('click', e => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const v = f.querySelector('video');
      player.src = v.getAttribute('src'); player.poster = v.poster || '';
      player.setAttribute('aria-label', f.getAttribute('aria-label') || 'Vidéo du portfolio');
      dialog.querySelector('.video-error').hidden = true;
      dialog.showModal(); player.play().catch(() => {});
    });
  });
}

(async () => {
  const projets = await loadProjects();
  const first = projets.find(p => safeURL(p.video)) || projets[0];
  // image de secours : une frame à 4 s plutôt que la première (souvent un fondu au noir)
  mountHero(safeURL(first?.video), safeURL(first?.image, { image: true }).replace('/so_0,', '/so_4,'));
  const frames = mountReel(projets);
  mountPlayer(frames);
  reveal(); navTheme();
})();
