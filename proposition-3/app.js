// Proposition 3 — un seul script pour l'accueil et les pages services :
// amorce, titre tramé (showreel ou photo dans les lettres), grilles, nav, lecteur, lightbox.
import { safeURL } from '../js/media-url.mjs';
import { mountBadge } from './badge.js';

const page = document.body.dataset.page || 'accueil';
const isHome = page === 'accueil';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canHover = matchMedia('(hover: hover)').matches;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const imageURL = v => safeURL(v, { image: true });

// ---------- données de l'admin (repli statique si le JSON est injoignable) ----------
const FALLBACK_HOME = {
  projets: [
    { titre: 'V8 Vantage — In Paris', type: 'Film', video: 'https://res.cloudinary.com/x59xsxis/video/upload/f_mp4,vc_h264,q_auto/v1788879482/portfolio-tom/video/3b2ca037-ae4f-4621-baa1-0974bf9d5247.mp4', image: 'https://res.cloudinary.com/x59xsxis/video/upload/so_0,f_jpg,q_auto,w_1600,c_limit/v1788879482/portfolio-tom/video/3b2ca037-ae4f-4621-baa1-0974bf9d5247.jpg' },
    { titre: 'Nicolas Joffre — Le Mans Classic', type: 'Film', video: 'https://res.cloudinary.com/x59xsxis/video/upload/f_mp4,vc_h264,q_auto/v1788880224/portfolio-tom/video/31aebd08-c6c2-41c0-8ef2-bceb40af86d5.mp4', image: 'https://res.cloudinary.com/x59xsxis/video/upload/so_0,f_jpg,q_auto,w_1600,c_limit/v1788880224/portfolio-tom/video/31aebd08-c6c2-41c0-8ef2-bceb40af86d5.jpg' },
    { titre: 'Nicolas Joffre — Les origines', type: 'Film', video: 'https://res.cloudinary.com/x59xsxis/video/upload/f_mp4,vc_h264,q_auto/v1788887854/portfolio-tom/video/6d10d3b9-c0d1-4af4-a59c-8999c6484702.mp4', image: 'https://res.cloudinary.com/x59xsxis/video/upload/so_0,f_jpg,q_auto,w_1600,c_limit/v1788887854/portfolio-tom/video/6d10d3b9-c0d1-4af4-a59c-8999c6484702.jpg' }
  ],
  galerie: []
};
async function loadData() {
  const url = isHome ? '/data/accueil.json' : `/data/services/${page}.json`;
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch { return isHome ? FALLBACK_HOME : { medias: [] }; }
}

// ---------- amorce 3·2·1 (accueil) : une fois par session, jamais si animations réduites ----------
const leader = document.querySelector('.leader');
const ready = () => document.body.classList.add('is-ready');
if (!leader) ready();
else {
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
}

// ---------- reveals ----------
const io = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: 0.12 });
const reveal = (root = document) => root.querySelectorAll('.sr:not(.in)').forEach(el => io.observe(el));
reveal();

// ---------- nav : blanche sur les blocs noirs ----------
const nav = document.querySelector('nav');
const darkBlocks = [...document.querySelectorAll('.credits, .services, footer')];
function navTheme() {
  const y = scrollY + 40;
  nav.classList.toggle('on-dark', darkBlocks.some(s => y >= s.offsetTop && y < s.offsetTop + s.offsetHeight));
  // accueil : le nom du logo n'apparaît qu'une fois le hero (et son grand nom) quitté
  if (isHome) nav.classList.toggle('at-top', scrollY < innerHeight * 0.55);
}
navTheme();
addEventListener('scroll', navTheme, { passive: true });
addEventListener('resize', navTheme);

// ============================================================
// HERO — la source (showreel ou photo) joue dans les lettres, en trame de points rouges
// ============================================================
function mountHero({ video: reelSrc, image: poster }) {
  const hero = document.querySelector('.hero');
  const cv = document.querySelector('.hero-canvas');
  const ctx = cv?.getContext('2d');
  if (!ctx) return;
  hero.classList.add('has-canvas');
  const titleOf = () => ((innerWidth <= 720 && hero.dataset.titleMobile) || hero.dataset.title || 'TOM|CARVALHO').split('|');

  let src = null, srcW = 0, srcH = 0;
  if (reduced || !reelSrc) {
    if (poster) {
      const img = new Image(); img.crossOrigin = 'anonymous'; img.src = poster;
      img.onload = () => { src = img; srcW = img.naturalWidth; srcH = img.naturalHeight; kick(); };
    }
  } else {
    const v = document.createElement('video');
    v.muted = true; v.loop = true; v.playsInline = true; v.crossOrigin = 'anonymous'; v.preload = 'auto';
    if (poster) v.poster = poster;
    v.src = reelSrc;
    v.addEventListener('loadeddata', () => { src = v; srcW = v.videoWidth; srcH = v.videoHeight; v.play().catch(() => {}); kick(); });
    v.addEventListener('error', () => { src = null; kick(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) v.pause(); else if (src === v) v.play().catch(() => {}); });
  }

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
    // chaque ligne remplit 90 % de la largeur ; Anton : capitale ≈ 0,84 em ; bloc centré, borné à 62 % de la hauteur
    ctx.font = '100px Anton';
    const target = W * 0.9, cap = 0.84, gap = 0.2;
    const words = titleOf();
    let sizes = words.map(w => 100 * target / Math.max(1, ctx.measureText(w).width));
    let block = sizes.reduce((h, f, i) => h + f * cap + (i ? f * gap : 0), 0);
    const maxH = H * 0.62;
    if (block > maxH) { const k = maxH / block; sizes = sizes.map(f => f * k); block = maxH; }
    let y = H * 0.5 - block / 2;
    lines = words.map((t, i) => { const f = sizes[i]; y += (i ? f * gap : 0) + f * cap; return { t, f, y }; });
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

  let raf = 0, visible = true, inView = true;
  function draw() {
    raf = 0;
    if (!W) return;
    ctx.clearRect(0, 0, W, H);
    if (!src || !srcW) { text('#e3170a'); return; }

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
      // la trame : un point rouge par cellule, gros là où l'image est claire, rayon plancher de 20 %
      const path = new Path2D();
      const maxR = cell * 0.56;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 4;
        const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
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
    // la loupe : sous le curseur, l'image nette en noir et blanc
    if (mouse.on) {
      mouse.x += (mouse.tx - mouse.x) * 0.18; mouse.y += (mouse.ty - mouse.y) * 0.18;
      const R = Math.min(W, H) * 0.22;
      ctx.save(); ctx.beginPath(); ctx.arc(mouse.x, mouse.y, R, 0, Math.PI * 2); ctx.clip();
      ctx.filter = 'grayscale(1) contrast(1.35)'; cover(ctx, W, H); ctx.restore();
    }
    // tout ça découpé par les lettres
    ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(mask, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';

    const live = src.tagName === 'VIDEO';
    if ((live || mouse.on) && visible && inView) raf = requestAnimationFrame(draw);
  }
  function kick() { if (!raf && visible && inView) raf = requestAnimationFrame(draw); }

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
}

// ============================================================
// GRILLES — films (accueil), sélection (services), photos
// ============================================================
const mediaTag = item => {
  const image = imageURL(item.image), video = safeURL(item.video);
  if (!video) return `<img src="${esc(image)}" alt="${esc(item.alt || item.titre)}" loading="lazy" decoding="async">`;
  const cover = item.poster === 'auto' || !image ? 'preload="metadata"' : `poster="${esc(image)}" preload="none"`;
  return `<video src="${esc(video)}" ${cover} data-image="${esc(image)}" muted loop playsinline aria-label="${esc(item.alt || item.titre)}"></video>`;
};
const linkAttrs = item => {
  const link = safeURL(item.lien), video = safeURL(item.video), image = imageURL(item.image);
  if (link) return `href="${esc(link)}" target="_blank" rel="noopener noreferrer"`;
  if (video) return `href="${esc(video)}" data-play="true" aria-label="Lire ${esc(item.titre || 'la vidéo')}"`;
  if (image) return `href="${esc(image)}" data-lightbox="true" aria-label="Agrandir ${esc(item.titre || 'la photo')}"`;
  return 'href="#fin"';
};
const cardTag = (item, i) => `<a class="card sr" style="--i:${i % 2}" ${linkAttrs(item)}>${mediaTag(item)}${safeURL(item.video) || safeURL(item.lien) ? '<span class="play" aria-hidden="true"></span>' : ''}<span class="meta"><h3>${esc(item.titre)}</h3><span>${esc(item.type || '')}</span></span></a>`;

function mountFilms(projets) {
  const grid = document.querySelector('.films-grid');
  if (!grid) return;
  grid.innerHTML = projets.map(cardTag).join('') + '<p class="grid-more sr">Un projet en tête ?<br><a href="#fin">Écris-moi →</a></p>';
  reveal(grid);
}

function mountPhotos(galerie) {
  const section = document.querySelector('.photos'); const grid = document.querySelector('.photos-grid');
  if (!section || !grid) return;
  const items = (galerie || []).filter(g => imageURL(g.image));
  if (!items.length) { section.hidden = true; return; }
  grid.innerHTML = items.map((g, i) => `<a class="photo sr" style="--i:${i % 3}" href="${esc(imageURL(g.image))}" data-lightbox="true" aria-label="Agrandir la photo"><img src="${esc(imageURL(g.image))}" alt="${esc(g.alt || g.legende || '')}" loading="lazy" decoding="async"><span class="cap">${esc(g.legende || '')}</span></a>`).join('');
  reveal(grid);
}

// pages services : médias sans catégorie d'abord, puis chaque catégorie numérotée (vides masquées)
function mountSelection(d) {
  const grid = document.querySelector('.sel-grid');
  if (!grid) return;
  const medias = Array.isArray(d.medias) ? d.medias : [];
  const categories = (Array.isArray(d.categories) ? d.categories : []).filter(c => c && typeof c.id === 'string' && c.id);
  const ids = new Set(categories.map(c => c.id));
  const loose = medias.filter(m => !ids.has(m.categorie));
  const blocks = categories.map(cat => ({ cat, items: medias.filter(m => m.categorie === cat.id) })).filter(b => b.items.length);
  const count = document.querySelector('.sel-count');
  if (count) count.innerHTML = `${pad(medias.length)} ${medias.length > 1 ? 'contenus' : 'contenu'}<br>${esc(d.periode || '')}`;
  if (!medias.length) { grid.innerHTML = '<p class="grid-empty sr">Sélection en cours de montage — <a href="#fin">écris-moi</a> pour voir des exemples.</p>'; reveal(grid); return; }
  grid.innerHTML = loose.map(cardTag).join('') +
    blocks.map((b, k) => `<div class="cat-head sr"><span class="cat-num">${pad(k + 1)}</span><h3>${esc(b.cat.titre)}</h3><span class="cat-count">${pad(b.items.length)} ${b.items.length > 1 ? 'contenus' : 'contenu'}</span></div>` + b.items.map(cardTag).join('')).join('') +
    '<p class="grid-more sr">Envie d\'en voir plus ?<br><a href="#fin">Écris-moi →</a></p>';
  reveal(grid);
}

// ---------- lecteur plein cadre, aperçu au survol, lightbox ----------
// ---------- lecteur vidéo : barre de contrôle vitrée, flottante ----------
const ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4.5h3.8v15H6.5zM13.7 4.5h3.8v15h-3.8z" fill="currentColor"/></svg>',
  vol: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  mute: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  full: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};
const clock = s => {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = Math.floor(s) % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

function mountVideoPlayer() {
  const dialog = document.createElement('dialog'); dialog.className = 'player';
  dialog.setAttribute('aria-label', 'Lecteur vidéo');
  dialog.innerHTML = `
    <div class="pl-frame">
      <video playsinline preload="metadata"></video>
      <button type="button" class="pl-btn pl-close" aria-label="Fermer la vidéo">${ICONS.close}</button>
      <p class="video-error" role="status" hidden>La vidéo est indisponible ou en cours de préparation. Réessaie dans un instant.</p>
      <div class="pl-bar">
        <div class="pl-line">
          <span class="pl-time pl-cur">0:00</span>
          <input class="pl-range pl-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="Position dans la vidéo">
          <span class="pl-time pl-dur">0:00</span>
        </div>
        <div class="pl-ctrl">
          <button type="button" class="pl-btn pl-play" aria-label="Lecture">${ICONS.play}</button>
          <button type="button" class="pl-btn pl-mute" aria-label="Couper le son">${ICONS.vol}</button>
          <input class="pl-range pl-vol" type="range" min="0" max="1" step="0.01" value="1" aria-label="Volume">
          <div class="pl-speeds" role="group" aria-label="Vitesse de lecture">
            <button type="button" data-rate="0.5">0.5x</button><button type="button" data-rate="1" aria-pressed="true">1x</button><button type="button" data-rate="1.5">1.5x</button><button type="button" data-rate="2">2x</button>
          </div>
          <button type="button" class="pl-btn pl-full" aria-label="Plein écran">${ICONS.full}</button>
        </div>
      </div>
    </div>`;
  document.body.append(dialog);
  const $ = sel => dialog.querySelector(sel);
  const frame = $('.pl-frame'), v = $('video'), seek = $('.pl-seek'), vol = $('.pl-vol');
  const cur = $('.pl-cur'), dur = $('.pl-dur'), playBtn = $('.pl-play'), muteBtn = $('.pl-mute'), err = $('.video-error');
  const fill = (range, ratio) => range.style.setProperty('--p', `${(Math.max(0, Math.min(1, ratio)) * 100).toFixed(2)}%`);
  let seeking = false, raf = 0, idle = 0;

  const syncPlay = () => {
    const playing = !v.paused && !v.ended;
    playBtn.innerHTML = playing ? ICONS.pause : ICONS.play;
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Lecture');
    dialog.classList.toggle('is-paused', !playing);
  };
  const syncTime = () => {
    cur.textContent = clock(v.currentTime); dur.textContent = clock(v.duration);
    if (!seeking && v.duration) { seek.value = Math.round((v.currentTime / v.duration) * 1000); fill(seek, v.currentTime / v.duration); }
  };
  const syncVol = () => {
    const level = v.muted ? 0 : v.volume;
    vol.value = level; fill(vol, level);
    muteBtn.innerHTML = level === 0 ? ICONS.mute : ICONS.vol;
    muteBtn.setAttribute('aria-label', level === 0 ? 'Rétablir le son' : 'Couper le son');
  };
  // la barre de progression avance à chaque image, pas seulement 4 fois par seconde
  const loop = () => { syncTime(); raf = dialog.open && !v.paused ? requestAnimationFrame(loop) : 0; };
  const toggle = () => { if (v.paused || v.ended) v.play().catch(() => {}); else v.pause(); };

  // les contrôles s'effacent après 2,5 s sans mouvement pendant la lecture
  const wake = () => {
    dialog.classList.remove('is-idle'); clearTimeout(idle);
    idle = setTimeout(() => { if (!v.paused && !dialog.querySelector('.pl-bar:hover')) dialog.classList.add('is-idle'); }, 2500);
  };

  v.addEventListener('play', () => { syncPlay(); if (!raf) raf = requestAnimationFrame(loop); wake(); });
  v.addEventListener('pause', () => { syncPlay(); dialog.classList.remove('is-idle'); });
  v.addEventListener('ended', syncPlay);
  v.addEventListener('loadedmetadata', syncTime);
  v.addEventListener('timeupdate', () => { if (!raf) syncTime(); });
  v.addEventListener('volumechange', syncVol);
  v.addEventListener('error', () => { if (v.hasAttribute('src')) err.hidden = false; });
  v.addEventListener('click', toggle);
  v.addEventListener('dblclick', () => $('.pl-full').click());

  playBtn.addEventListener('click', toggle);
  muteBtn.addEventListener('click', () => { if (v.muted || v.volume === 0) { v.muted = false; if (!v.volume) v.volume = 1; } else v.muted = true; });
  vol.addEventListener('input', () => { v.volume = +vol.value; v.muted = +vol.value === 0; });
  seek.addEventListener('input', () => {
    seeking = true;
    const r = seek.value / 1000; fill(seek, r);
    if (v.duration) { v.currentTime = r * v.duration; cur.textContent = clock(v.currentTime); }
  });
  seek.addEventListener('change', () => { seeking = false; });
  dialog.querySelectorAll('.pl-speeds button').forEach(b => b.addEventListener('click', () => {
    v.playbackRate = +b.dataset.rate;
    dialog.querySelectorAll('.pl-speeds button').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
  }));
  $('.pl-full').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else if (frame.requestFullscreen) frame.requestFullscreen().catch(() => {});
    else v.webkitEnterFullscreen?.();
  });
  $('.pl-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('pointermove', wake);
  // raccourcis : espace = lecture, flèches = ±5 s, M = son, F = plein écran
  dialog.addEventListener('keydown', e => {
    if (e.target.matches('input[type=range]') && e.key.startsWith('Arrow')) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'k') { if (e.target.tagName === 'BUTTON' && k === ' ') return; e.preventDefault(); toggle(); }
    else if (k === 'arrowright') { v.currentTime = Math.min(v.duration || 0, v.currentTime + 5); }
    else if (k === 'arrowleft') { v.currentTime = Math.max(0, v.currentTime - 5); }
    else if (k === 'm') muteBtn.click();
    else if (k === 'f') $('.pl-full').click();
    else return;
    wake();
  });
  dialog.addEventListener('close', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    cancelAnimationFrame(raf); raf = 0; clearTimeout(idle);
    v.pause(); v.removeAttribute('src'); v.load();
    dialog.classList.remove('is-idle');
  });
  syncVol();

  return {
    get open() { return dialog.open; },
    play(src, poster, label) {
      err.hidden = true;
      v.src = src; v.poster = poster || '';
      v.setAttribute('aria-label', label || 'Vidéo du portfolio');
      seek.value = 0; fill(seek, 0); cur.textContent = '0:00'; dur.textContent = '0:00';
      dialog.showModal(); syncPlay();
      v.play().catch(() => syncPlay());
      playBtn.focus({ preventScroll: true });
    }
  };
}

// ---------- visionneuse photo : même langage vitré que le lecteur, navigation entre les photos ----------
function mountLightbox() {
  const cards = [...document.querySelectorAll('[data-lightbox]')];
  if (!cards.length) return;
  const arrow = d => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  const box = document.createElement('dialog'); box.className = 'viewer';
  box.setAttribute('aria-label', 'Visionneuse photo');
  box.innerHTML = `
    <figure class="vw-stage">
      <img class="vw-img" alt="" draggable="false">
      <figcaption class="vw-bar">
        <span class="vw-cap"></span>
        <span class="vw-count" aria-live="polite"></span>
      </figcaption>
    </figure>
    <button type="button" class="pl-btn vw-close" aria-label="Fermer la photo">${ICONS.close}</button>
    <button type="button" class="pl-btn vw-nav vw-prev" aria-label="Photo précédente">${arrow('M15 5l-7 7 7 7')}</button>
    <button type="button" class="pl-btn vw-nav vw-next" aria-label="Photo suivante">${arrow('M9 5l7 7-7 7')}</button>`;
  document.body.append(box);
  const img = box.querySelector('.vw-img'), cap = box.querySelector('.vw-cap'), count = box.querySelector('.vw-count');
  let group = [], index = 0;

  // chaque grille est une série : on navigue entre les photos d'une même section
  const groupOf = card => {
    const grid = card.closest('.photos-grid, .sel-grid, .films-grid') || document;
    return [...grid.querySelectorAll('[data-lightbox]')].filter(c => c.querySelector('img'));
  };
  function show(i, dir = 0) {
    index = (i + group.length) % group.length;
    const card = group[index], thumb = card.querySelector('img');
    img.classList.remove('is-in'); img.style.setProperty('--dx', `${dir * 24}px`);
    // la vignette s'affiche tout de suite, la grande image la remplace dès qu'elle est chargée
    img.src = thumb.currentSrc || thumb.src;
    const full = card.getAttribute('href');
    if (full && full !== img.src) { const hi = new Image(); hi.onload = () => { if (group[index] === card) img.src = full; }; hi.src = full; }
    img.alt = thumb.alt || '';
    cap.textContent = card.querySelector('h3, .cap')?.textContent?.trim() || thumb.alt || '';
    count.textContent = group.length > 1 ? `${pad(index + 1)} / ${pad(group.length)}` : '';
    box.classList.toggle('is-single', group.length < 2);
    box.querySelector('.vw-bar').hidden = !cap.textContent && !count.textContent;
    requestAnimationFrame(() => img.classList.add('is-in'));
  }
  const step = d => { if (group.length > 1) show(index + d, d); };

  box.querySelector('.vw-close').addEventListener('click', () => box.close());
  box.querySelector('.vw-prev').addEventListener('click', () => step(-1));
  box.querySelector('.vw-next').addEventListener('click', () => step(1));
  box.addEventListener('click', e => { if (e.target === box || e.target.classList.contains('vw-stage')) box.close(); });
  box.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  });
  // glisser au doigt pour passer d'une photo à l'autre
  let sx = null, sy = 0;
  box.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  box.addEventListener('touchend', e => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
  });
  box.addEventListener('close', () => { img.removeAttribute('src'); img.classList.remove('is-in'); group[index]?.focus?.({ preventScroll: true }); });

  cards.forEach(card => card.addEventListener('click', e => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    if (!card.querySelector('img')) return;
    e.preventDefault();
    group = groupOf(card);
    box.showModal();
    show(group.indexOf(card));
    box.querySelector('.vw-close').focus({ preventScroll: true });
  }));
}

function mountPlayers() {
  const player = mountVideoPlayer();

  document.querySelectorAll('.card video').forEach(video => {
    const card = video.closest('a');
    const hover = () => { if (!player.open && canHover && !reduced) video.play().catch(() => {}); };
    const stop = () => { video.pause(); if (video.readyState) video.currentTime = 0; };
    card.addEventListener('mouseenter', hover); card.addEventListener('mouseleave', stop);
    card.addEventListener('focus', hover); card.addEventListener('blur', stop);
    if (card.dataset.play) card.addEventListener('click', e => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault(); document.querySelectorAll('.card video').forEach(v => v.pause());
      player.play(video.getAttribute('src'), video.poster || video.dataset.image, video.getAttribute('aria-label'));
    });
    video.addEventListener('error', () => {
      if (video.dataset.fallback) return;
      video.dataset.fallback = 'true';
      const still = video.poster || video.dataset.image; if (!still) return;
      const img = document.createElement('img'); img.src = still; img.alt = video.getAttribute('aria-label') || ''; video.hidden = true; video.after(img);
    });
  });

  mountLightbox();
}

(async () => {
  const d = await loadData();
  if (isHome) {
    const projets = Array.isArray(d.projets) ? d.projets : [];
    const first = projets.find(p => safeURL(p.video)) || projets[0];
    // image de secours : une frame à 4 s plutôt que la première (souvent un fondu au noir)
    mountHero({ video: safeURL(first?.video), image: imageURL(first?.image).replace('/so_0,', '/so_4,') });
    // la lanière imprime Anton et Plex Mono sur canvas : on attend les polices (1,5 s max)
    const stage = document.querySelector('[data-badge]');
    if (stage) Promise.race([
      Promise.all([document.fonts?.load('20px Anton'), document.fonts?.load('500 10px "IBM Plex Mono"')]),
      new Promise(r => setTimeout(r, 1500))
    ]).catch(() => {}).then(() => mountBadge(stage, document.querySelector('.badge-anchor')));
    mountFilms(projets);
    mountPhotos(d.galerie);
  } else {
    const hero = document.querySelector('.hero');
    const heroImage = imageURL(d.hero?.image) || hero.dataset.image || '';
    // la photo du service dans les lettres ; le premier film de la sélection s'il y en a un
    const firstVideo = (d.medias || []).find(m => safeURL(m.video));
    mountHero({ video: safeURL(firstVideo?.video), image: heroImage });
    mountSelection(d);
  }
  mountPlayers();
  reveal(); navTheme();
})();
