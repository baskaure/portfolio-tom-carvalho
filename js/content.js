// Static HTML remains a fallback if the editable JSON cannot be loaded.
(async () => {
  const page = document.body.dataset.page;
  if (!['accueil', 'contenu', 'institutionnel', 'aftermovies', 'shooting', 'etalonnage'].includes(page)) return;
  const { safeURL } = await import('./media-url.mjs');
  const url = page === 'accueil' ? '/data/accueil.json' : `/data/services/${page}.json`;
  let d, preview = false;
  try {
    const id = new URLSearchParams(location.search).get('preview');
    if (id && /^[a-f0-9-]{36}$/.test(id)) {
      const saved = JSON.parse(sessionStorage.getItem(`tom-preview:${id}`) || 'null');
      if (saved?.page === page && saved.data) { d = saved.data; preview = true; window.opener = null; }
    }
  } catch { /* The public page never depends on browser storage availability. */ }
  if (!d) {
    try {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) return;
      d = await response.json();
    } catch { return; }
  }
  if (preview) {
    const banner = document.createElement('div'); banner.className = 'admin-preview-banner';
    banner.textContent = 'APERÇU DU BROUILLON — ces changements ne sont pas encore publiés.';
    const link = document.createElement('a'); link.href = location.pathname; link.textContent = 'Voir la version publique ↗'; banner.append(link); document.body.append(banner);
  }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const imageURL = value => safeURL(value, { image: true, preview });
  const setImg = (selector, item) => {
    const img = document.querySelector(selector); const src = imageURL(item?.image);
    if (img && src) { img.src = src; img.alt = item.alt || ''; }
  };
  const mediaTag = item => {
    const image = imageURL(item.image); const video = safeURL(item.video);
    return video ? `<video src="${esc(video)}" poster="${esc(image)}" muted loop playsinline preload="none" aria-label="${esc(item.alt || item.titre)}"></video>`
      : `<img src="${esc(image)}" alt="${esc(item.alt || item.titre)}" loading="lazy" decoding="async">`;
  };
  const linkAttrs = item => {
    const link = safeURL(item.lien); const video = safeURL(item.video);
    if (link) return `href="${esc(link)}" target="_blank" rel="noopener noreferrer"`;
    if (video) return `href="${esc(video)}" data-play-video="true" aria-label="Lire ${esc(item.titre || 'la vidéo')}"`;
    return 'href="#contact"';
  };
  const reveal = root => window.reveal?.(root);
  if (page === 'accueil') {
    setImg('.hero-photo img', d.hero); setImg('.about-photo img', d.manifeste);
    const caption = document.querySelector('.about-photo .caption');
    if (caption && typeof d.manifeste?.legende === 'string') caption.textContent = d.manifeste.legende;
    const projects = document.querySelector('.work-grid');
    if (projects && Array.isArray(d.projets)) {
      projects.innerHTML = d.projets.map((item, i) => `<a class="card c${(i % 3) + 1} sr" ${linkAttrs(item)}><div class="frame ht">${mediaTag(item)}<div class="tint"></div></div><span class="idx">${String(i + 1).padStart(2, '0')}</span>${safeURL(item.video) || safeURL(item.lien) ? '<span class="play" aria-hidden="true"></span>' : ''}<div class="meta"><h3>${esc(item.titre)}</h3><span class="kind">${esc(item.type)}</span></div></a>`).join('') +
        '<p class="work-more sr">Si un projet vous intéresse,<br><a href="#contact">contactez-moi →</a></p>';
      reveal(projects);
    }
    const gallery = document.querySelector('.gal-grid');
    if (gallery && Array.isArray(d.galerie)) {
      gallery.innerHTML = d.galerie.map((item, i) => `<figure class="gph ${item.style === 'polar' ? 'polar' : 'raw'} g${(i % 5) + 1} sr${i % 2 ? ' sr-d1' : ''}">${item.style === 'polar' ? '<div class="tape" aria-hidden="true"></div>' : ''}<div class="ht"><img src="${esc(imageURL(item.image))}" alt="${esc(item.alt || item.legende)}" loading="lazy" decoding="async"><div class="tint"></div></div><figcaption class="cap">${esc(item.legende)}</figcaption></figure>`).join('') +
        (d.galerie.length ? '<p class="gal-note sr">chaque tournage laisse des images en trop —<br>les voilà.</p>' : '');
      reveal(gallery);
    }
  } else {
    setImg('.sh-photo img', d.hero);
    const grid = document.querySelector('.sd-media .grid');
    const formats = ['m-w', 'm-n', 'm-v', 'm-h', 'm-f'];
    if (grid && Array.isArray(d.medias)) {
      grid.innerHTML = d.medias.map((item, i) => `<a class="med ${formats.includes(item.format) ? item.format : 'm-w'} sr" ${linkAttrs(item)}><div class="ht">${mediaTag(item)}<div class="tint"></div></div><span class="idx">${String(i + 1).padStart(2, '0')}</span>${safeURL(item.video) || safeURL(item.lien) ? '<span class="play" aria-hidden="true"></span>' : ''}<div class="meta"><h3>${esc(item.titre)}</h3><span class="kind">${esc(item.type)}</span></div></a>`).join('') +
        '<p class="more sr">Envie d’en voir plus ?<br><a href="#contact">contactez-moi →</a></p>';
      reveal(grid);
    }
    const count = document.querySelector('.sd-media .count');
    if (count) count.innerHTML = `${String(d.medias?.length || 0).padStart(2, '0')} contenus<br>${esc(d.periode || '')}`;
  }
  const dialog = document.createElement('dialog'); dialog.className = 'portfolio-video-dialog';
  dialog.innerHTML = '<button type="button" class="video-close" aria-label="Fermer la vidéo">Fermer ×</button><video controls playsinline preload="metadata"></video><p class="video-error" role="status" hidden>La vidéo est indisponible ou en cours de préparation. Réessaie dans un instant.</p>';
  document.body.append(dialog);
  const player = dialog.querySelector('video');
  dialog.querySelector('button').onclick = () => dialog.close();
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { player.pause(); player.removeAttribute('src'); player.load(); });
  player.addEventListener('error', () => { if (player.hasAttribute('src')) dialog.querySelector('.video-error').hidden = false; });
  document.querySelectorAll('.card video, .med video').forEach(video => {
    const card = video.closest('a');
    const hover = () => {
      if (!dialog.open && matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) video.play().catch(() => {});
    };
    const stop = () => { video.pause(); if (video.readyState) video.currentTime = 0; };
    card.addEventListener('mouseenter', hover); card.addEventListener('mouseleave', stop);
    card.addEventListener('focus', hover); card.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
    if (card.dataset.playVideo) card.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); document.querySelectorAll('.card video, .med video').forEach(v => v.pause());
      player.src = video.getAttribute('src'); player.poster = video.poster; player.setAttribute('aria-label', video.getAttribute('aria-label') || 'Vidéo du portfolio');
      dialog.querySelector('.video-error').hidden = true; dialog.showModal(); player.play().catch(() => {});
    });
    video.addEventListener('error', () => {
      if (video.dataset.fallback) return;
      video.dataset.fallback = 'true';
      const img = document.createElement('img'); img.src = video.poster; img.alt = video.getAttribute('aria-label') || ''; video.hidden = true; video.after(img);
    });
  });
  window.navTheme?.();
})();
