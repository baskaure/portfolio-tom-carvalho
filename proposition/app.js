// Proposition « générique » — un seul script : intro, films, nav, lecteur.
import { safeURL } from '../js/media-url.mjs';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- intro : on lance la séquence dès que les polices sont là (700 ms max) ----------
const ready = () => document.body.classList.add('is-ready');
Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise(r => setTimeout(r, 700))]).then(ready);

// ---------- reveals au scroll ----------
const io = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: 0.12 });
const reveal = (root = document) => root.querySelectorAll('.sr:not(.in)').forEach(el => io.observe(el));
reveal();

// ---------- nav : claire sur le papier, logo masqué sur la carte-titre ----------
const nav = document.querySelector('nav');
const hero = document.querySelector('.hero');
const paper = [...document.querySelectorAll('.hero, .about')];
function navTheme() {
  const y = scrollY + 40;
  nav.classList.toggle('on-paper', paper.some(s => y >= s.offsetTop && y < s.offsetTop + s.offsetHeight));
  nav.classList.toggle('hide-logo', scrollY < hero.offsetHeight * 0.7);
}
addEventListener('scroll', navTheme, { passive: true });
navTheme();

// ---------- hero : parallaxe douce à la souris ----------
if (matchMedia('(hover: hover)').matches && !reduced.matches) {
  const photo = hero.querySelector('.hero-photo img');
  const spark = hero.querySelector('.spark-hero svg');
  let raf = 0, tx = 0, ty = 0;
  hero.addEventListener('pointermove', e => {
    tx = (e.clientX / innerWidth - .5); ty = (e.clientY / innerHeight - .5);
    if (!raf) raf = requestAnimationFrame(() => {
      raf = 0;
      photo.style.transform = `scale(1.06) translate(${tx * -14}px, ${ty * -10}px)`;
      spark.style.transform = `rotate(${tx * 30}deg)`;
    });
  });
}

// ---------- films : données de l'admin (repli statique si le JSON est injoignable) ----------
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
  } catch { /* fichier ouvert en local ou JSON absent : on garde le repli */ }
  return FALLBACK;
}

const pad = n => String(n).padStart(2, '0');
const tc = s => `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(Math.floor(s) % 60)}:${pad(Math.floor((s % 1) * 25))}`;

(async () => {
  const projets = await loadProjects();
  const list = document.querySelector('.films-list');
  const stack = document.querySelector('.screen-stack');
  const cur = document.querySelector('.films-count .cur');
  const tot = document.querySelector('.films-count .tot');
  const tcEl = document.querySelector('.screen-tc');
  tot.textContent = pad(projets.length);

  stack.innerHTML = projets.map((p, i) => {
    const video = safeURL(p.video), image = safeURL(p.image, { image: true });
    if (video) return `<video src="${esc(video)}" ${image ? `poster="${esc(image)}"` : ''} preload="metadata" muted loop playsinline data-i="${i}" aria-hidden="true"></video>`;
    return `<img src="${esc(image)}" alt="" data-i="${i}" loading="lazy">`;
  }).join('');

  list.innerHTML = projets.map((p, i) => {
    const link = safeURL(p.lien), video = safeURL(p.video);
    const href = link || video || '#contact';
    const cta = video ? 'Voir le film →' : link ? 'Ouvrir ↗' : 'Me contacter →';
    return `<li class="film sr" data-i="${i}" ${video ? 'data-play="true"' : ''}>
      <span class="idx">${pad(i + 1)}</span>
      <h3><a href="${esc(href)}" ${link ? 'target="_blank" rel="noopener noreferrer"' : ''}>${esc(p.titre)}</a></h3>
      <div class="meta"><span>${esc(p.type || 'Film')}</span><span class="cta">${cta}</span></div>
    </li>`;
  }).join('') + '<li class="films-more sr">Un projet en tête ?<br><a href="#contact">Écris-moi →</a></li>';
  reveal(list);

  const films = [...list.querySelectorAll('.film')];
  const layers = [...stack.children];
  let active = -1;
  function setActive(i) {
    if (i === active) return;
    active = i;
    films.forEach((f, k) => f.classList.toggle('is-on', k === i));
    layers.forEach((l, k) => {
      l.classList.toggle('is-on', k === i);
      if (l.tagName !== 'VIDEO') return;
      if (k === i && !reduced.matches) l.play().catch(() => {}); else { l.pause(); }
    });
    cur.textContent = pad(i + 1);
  }
  setActive(0);

  // le film qui traverse le centre de l'écran s'allume
  const spy = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) setActive(+e.target.dataset.i); });
  }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
  films.forEach(f => spy.observe(f));
  films.forEach(f => f.addEventListener('pointerenter', () => { if (matchMedia('(hover: hover)').matches) setActive(+f.dataset.i); }));

  // timecode de l'écran
  setInterval(() => {
    const l = layers[active];
    tcEl.textContent = tc(l && l.tagName === 'VIDEO' ? l.currentTime : 0);
  }, 120);

  // lecteur plein cadre
  const dialog = document.createElement('dialog'); dialog.className = 'portfolio-video-dialog';
  dialog.innerHTML = '<button type="button" class="video-close" aria-label="Fermer la vidéo">Fermer ×</button><video controls playsinline preload="metadata"></video><p class="video-error" role="status" hidden>La vidéo est indisponible ou en cours de préparation. Réessaie dans un instant.</p>';
  document.body.append(dialog);
  const player = dialog.querySelector('video');
  dialog.querySelector('button').onclick = () => dialog.close();
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { player.pause(); player.removeAttribute('src'); player.load(); layers[active]?.play?.().catch?.(() => {}); });
  player.addEventListener('error', () => { if (player.hasAttribute('src')) dialog.querySelector('.video-error').hidden = false; });

  films.forEach(f => {
    if (!f.dataset.play) return;
    f.addEventListener('click', e => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const layer = layers[+f.dataset.i];
      layers.forEach(l => l.pause?.());
      player.src = layer.getAttribute('src'); player.poster = layer.poster || '';
      player.setAttribute('aria-label', f.querySelector('h3').textContent);
      dialog.querySelector('.video-error').hidden = true;
      dialog.showModal(); player.play().catch(() => {});
    });
  });

  document.addEventListener('visibilitychange', () => { if (document.hidden) layers.forEach(l => l.pause?.()); else layers[active]?.play?.().catch?.(() => {}); });
  navTheme();
})();
