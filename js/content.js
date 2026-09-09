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
    if (!video) return `<img src="${esc(image)}" alt="${esc(item.alt || item.titre)}" loading="lazy" decoding="async">`;
    // poster "auto" : aucune image de couverture, le navigateur affiche le premier plan du film
    const auto = item.poster === 'auto';
    const cover = auto || !image ? 'preload="metadata"' : `poster="${esc(image)}" preload="none"`;
    return `<video src="${esc(video)}" ${cover} data-image="${esc(image)}" muted loop playsinline aria-label="${esc(item.alt || item.titre)}"></video>`;
  };
  const linkAttrs = (item, lightbox = false) => {
    const link = safeURL(item.lien); const video = safeURL(item.video); const image = imageURL(item.image);
    if (link) return `href="${esc(link)}" target="_blank" rel="noopener noreferrer"`;
    if (video) return `href="${esc(video)}" data-play-video="true" aria-label="Lire ${esc(item.titre || 'la vidéo')}"`;
    if (lightbox && image) return `href="${esc(image)}" data-lightbox="true" aria-label="Agrandir ${esc(item.titre || 'la photo')}"`;
    return 'href="#contact"';
  };
  const reveal = root => window.reveal?.(root);
  if (page === 'accueil') {
    setImg('.hero-photo img', d.hero); setImg('.about-photo img', d.manifeste);
    const caption = document.querySelector('.about-photo .caption');
    if (caption && typeof d.manifeste?.legende === 'string') caption.textContent = d.manifeste.legende;
    const projects = document.querySelector('.work-grid');
    if (projects && Array.isArray(d.projets)) {
      projects.innerHTML = d.projets.map((item, i) => `<a class="card c${(i % 3) + 1} sr" ${linkAttrs(item, true)}><div class="frame ht">${mediaTag(item)}<div class="tint"></div></div><span class="idx">${String(i + 1).padStart(2, '0')}</span>${safeURL(item.video) || safeURL(item.lien) ? '<span class="play" aria-hidden="true"></span>' : ''}<div class="meta"><h3>${esc(item.titre)}</h3><span class="kind">${esc(item.type)}</span></div></a>`).join('') +
        '<p class="work-more sr">Si un projet vous intéresse,<br><a href="#contact">contactez-moi →</a></p>';
      reveal(projects);
    }
    const gallery = document.querySelector('.gal-grid');
    if (gallery && Array.isArray(d.galerie)) {
      gallery.innerHTML = d.galerie.map((item, i) => `<figure class="gph ${item.style === 'polar' ? 'polar' : 'raw'} g${(i % 5) + 1} sr${i % 2 ? ' sr-d1' : ''}"${imageURL(item.image) ? ' data-lightbox="true" tabindex="0" role="button" aria-label="Agrandir la photo"' : ''}>${item.style === 'polar' ? '<div class="tape" aria-hidden="true"></div>' : ''}<div class="ht"><img src="${esc(imageURL(item.image))}" alt="${esc(item.alt || item.legende)}" loading="lazy" decoding="async"><div class="tint"></div></div><figcaption class="cap">${esc(item.legende)}</figcaption></figure>`).join('') +
        (d.galerie.length ? '<p class="gal-note sr">chaque tournage laisse des images en trop —<br>les voilà.</p>' : '');
      reveal(gallery);
    }
  } else {
    setImg('.sh-photo img', d.hero);
    const grid = document.querySelector('.sd-media .grid');
    const formats = ['m-w', 'm-n', 'm-v', 'm-h', 'm-f'];
    if (grid && Array.isArray(d.medias)) {
      const medTag = item => `<a class="med ${formats.includes(item.format) ? item.format : 'm-w'} sr" ${linkAttrs(item, true)}><div class="ht">${mediaTag(item)}<div class="tint"></div></div>${safeURL(item.video) || safeURL(item.lien) ? '<span class="play" aria-hidden="true"></span>' : ''}</a>`;
      // catégories numérotées (créées dans l'admin) : les médias sans catégorie viennent d'abord,
      // puis chaque catégorie dans l'ordre choisi. Une catégorie vide n'est pas affichée et la
      // numérotation reste continue (01, 02, 03…) sur la page.
      const categories = (Array.isArray(d.categories) ? d.categories : []).filter(c => c && typeof c.id === 'string' && c.id);
      const ids = new Set(categories.map(c => c.id));
      const loose = d.medias.filter(item => !ids.has(item.categorie));
      const blocks = categories.map(cat => ({ cat, items: d.medias.filter(item => item.categorie === cat.id) })).filter(b => b.items.length)
        .map((b, i) => ({ ...b, num: String(i + 1).padStart(2, '0') }));
      grid.innerHTML = loose.map(medTag).join('') +
        blocks.map(b => `<div class="cat-head sr"><span class="cat-num">${b.num}</span><h3>${esc(b.cat.titre)}</h3><span class="cat-count">${String(b.items.length).padStart(2, '0')} ${b.items.length > 1 ? 'contenus' : 'contenu'}</span></div>` + b.items.map(medTag).join('')).join('') +
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
      const still = video.poster || video.dataset.image; if (!still) return;
      const img = document.createElement('img'); img.src = still; img.alt = video.getAttribute('aria-label') || ''; video.hidden = true; video.after(img);
    });
  });
  // lightbox : les photos (services, projets, galerie) s'ouvrent en grand au clic
  const lightbox = document.createElement('dialog'); lightbox.className = 'portfolio-image-dialog';
  lightbox.innerHTML = '<button type="button" class="video-close" aria-label="Fermer la photo">Fermer ×</button><figure><img alt=""><figcaption></figcaption></figure>';
  document.body.append(lightbox);
  const lightboxImg = lightbox.querySelector('img'); const lightboxCap = lightbox.querySelector('figcaption');
  lightbox.querySelector('button').onclick = () => lightbox.close();
  lightbox.addEventListener('click', event => { if (event.target === lightbox) lightbox.close(); });
  lightbox.addEventListener('close', () => { lightboxImg.removeAttribute('src'); });
  const openLightbox = (card, event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const img = card.querySelector('.ht img'); if (!img) return;
    event.preventDefault();
    lightboxImg.src = card.getAttribute('href') || img.currentSrc || img.src; lightboxImg.alt = img.alt || '';
    lightboxCap.textContent = card.querySelector('h3, .cap')?.textContent?.trim() || img.alt || '';
    lightbox.showModal();
  };
  document.querySelectorAll('[data-lightbox]').forEach(card => {
    card.addEventListener('click', event => openLightbox(card, event));
    if (card.tagName !== 'A') card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') openLightbox(card, event); });
  });
  window.navTheme?.();
})();
