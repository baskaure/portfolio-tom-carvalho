// Rendu des médias depuis data/*.json (édités via /admin).
// Le HTML contient déjà une version statique : si le JSON ne charge pas
// (ouverture en file://, hors ligne), la page reste telle quelle.
(async () => {
  const page = document.body.dataset.page;
  if (!page) return;
  const url = page === 'accueil' ? '/data/accueil.json' : `/data/services/${page}.json`;
  let d;
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) return;
    d = await r.json();
  } catch { return; }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const setImg = (sel, o) => {
    const img = document.querySelector(sel);
    if (img && o?.image) { img.src = o.image; img.alt = o.alt || ''; }
  };
  // média d'une carte : vidéo (lecture au survol) ou image
  const mediaTag = m => m.video
    ? `<video src="${esc(m.video)}" poster="${esc(m.image)}" muted loop playsinline preload="metadata" aria-label="${esc(m.alt || m.titre)}"></video>`
    : `<img src="${esc(m.image)}" alt="${esc(m.alt || m.titre)}">`;
  const linkAttrs = m => m.lien ? `href="${esc(m.lien)}" target="_blank" rel="noopener"` : 'href="#contact"';

  if (page === 'accueil') {
    setImg('.hero-photo img', d.hero);
    setImg('.about-photo img', d.manifeste);
    const cap = document.querySelector('.about-photo .caption');
    if (cap && d.manifeste?.legende) cap.textContent = d.manifeste.legende;

    // projets : motif c1 / c2 / c3 répété
    const wg = document.querySelector('.work-grid');
    if (wg && d.projets?.length) {
      wg.innerHTML = d.projets.map((p, i) => `
        <a class="card c${(i % 3) + 1} sr" ${linkAttrs(p)}>
          <div class="frame ht">${mediaTag(p)}<div class="tint"></div></div>
          <span class="idx">${String(i + 1).padStart(2, '0')}</span>
          <span class="play" aria-hidden="true"></span>
          <div class="meta"><h3>${esc(p.titre)}</h3><span class="kind">${esc(p.type)}</span></div>
        </a>`).join('') +
        `<p class="work-more sr">Si un projet vous intéresse,<br><a href="#contact">contactez-moi →</a></p>`;
      reveal(wg);
    }

    // galerie : motif g1 … g5 répété
    const gg = document.querySelector('.gal-grid');
    if (gg && d.galerie?.length) {
      gg.innerHTML = d.galerie.map((g, i) => `
        <figure class="gph ${g.style === 'polar' ? 'polar' : 'raw'} g${(i % 5) + 1} sr${i % 2 ? ' sr-d1' : ''}">
          ${g.style === 'polar' ? '<div class="tape" aria-hidden="true"></div>' : ''}
          <div class="ht"><img src="${esc(g.image)}" alt="${esc(g.alt || g.legende)}"><div class="tint"></div></div>
          <figcaption class="cap">${esc(g.legende)}</figcaption>
        </figure>`).join('') +
        `<p class="gal-note sr">chaque tournage laisse des images en trop —<br>les voilà.</p>`;
      reveal(gg);
    }
  } else {
    setImg('.sh-photo img', d.hero);
    const grid = document.querySelector('.sd-media .grid');
    if (grid && d.medias?.length) {
      grid.innerHTML = d.medias.map((m, i) => `
        <a class="med ${esc(m.format || 'm-w')} sr" ${linkAttrs(m)}>
          <div class="ht">${mediaTag(m)}<div class="tint"></div></div>
          <span class="idx">${String(i + 1).padStart(2, '0')}</span>
          <span class="play" aria-hidden="true"></span>
          <div class="meta"><h3>${esc(m.titre)}</h3><span class="kind">${esc(m.type)}</span></div>
        </a>`).join('') +
        `<p class="more sr">Envie d'en voir plus ?<br><a href="#contact">contactez-moi →</a></p>`;
      reveal(grid);
    }
    const count = document.querySelector('.sd-media .count');
    if (count) count.innerHTML = `${String(d.medias?.length || 0).padStart(2, '0')} contenus<br>${esc(d.periode || '')}`;
  }

  // vidéos : lecture au survol
  document.querySelectorAll('.card video, .med video').forEach(v => {
    const box = v.closest('a');
    box.addEventListener('mouseenter', () => v.play().catch(() => {}));
    box.addEventListener('mouseleave', () => { v.pause(); v.currentTime = 0; });
  });

  navTheme();
})();
