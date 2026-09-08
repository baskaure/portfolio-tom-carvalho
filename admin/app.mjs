import { PAGES, GitStore, ApiError, safeURL, validatePage, draftStore } from './api.mjs';
import { IMAGE_ACCEPT, VIDEO_ACCEPT, fileKind, mediaRequest, uploadCloud, optimizePhoto } from './media.mjs';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = value => structuredClone(value);
const state = { user: null, page: 'accueil', data: null, sha: null, dirty: false, busy: false, assets: [], jobs: [], storage: null, pendingDraft: null, dialog: null, deployment: 0 };
let draftTimer, saveChain = Promise.resolve(), sessionGeneration = 0;
const token = async () => {
  const user = window.netlifyIdentity?.currentUser();
  if (!user) throw new ApiError('Reconnecte-toi pour continuer. Ton brouillon est conservé.', 401);
  try { return await user.jwt(); } catch { throw new ApiError('Ta session a expiré. Reconnecte-toi pour continuer.', 401); }
};
const git = new GitStore(token);
const activeJobs = () => state.jobs.some(job => ['waiting', 'running'].includes(job.status));
const draftKey = () => `${state.user?.id || state.user?.email}:${state.page}`;
const previewImage = url => {
  const asset = state.assets.find(asset => asset.path === url);
  return asset ? `data:image/webp;base64,${asset.base64}` : safeURL(url);
};
function notice(message, success = false) {
  $('#notice').textContent = message; $('#notice').hidden = !message;
  $('#notice').classList.toggle('success', success);
}
function controls() {
  const locked = state.busy || activeJobs();
  $('#publish').disabled = !state.data || !state.dirty || locked || !!state.pendingDraft;
  $('#preview').disabled = !state.data || state.busy;
  $('#reload').disabled = locked;
  $('#export').disabled = !state.data || state.busy;
  $('#editor').inert = locked || !!state.pendingDraft;
  $('#logout').disabled = locked; $('#mobile-logout').disabled = locked;
  document.querySelectorAll('.page-link').forEach(button => { button.disabled = !state.user || locked; });
  $('#publish').innerHTML = state.busy ? 'Un instant…' : 'Publier les changements <span>↑</span>';
}
function renderNav() {
  $('#pages').innerHTML = Object.entries(PAGES).map(([key, page], i) => `<button class="page-link ${key === state.page ? 'active' : ''}" data-page="${key}" ${key === state.page ? 'aria-current="page"' : ''}><span class="number">${String(i + 1).padStart(2, '0')}</span>${esc(page.label)}<span class="arrow">↗</span></button>`).join('');
  controls();
}
function markDirty() {
  state.dirty = true;
  $('#save-status').textContent = 'Modifications à publier · sauvegarde du brouillon…';
  clearTimeout(draftTimer); draftTimer = setTimeout(() => { saveDraft(); }, 400); controls();
}
async function saveDraft() {
  clearTimeout(draftTimer);
  if (!state.data || !state.dirty || state.pendingDraft) return true;
  const key = draftKey(); const snapshot = { data: clone(state.data), baseSha: state.sha, assets: clone(state.assets), savedAt: Date.now() };
  const task = saveChain.catch(() => {}).then(() => draftStore('put', key, snapshot));
  saveChain = task;
  try {
    await task;
    if (draftKey() === key && state.dirty) $('#save-status').textContent = 'Brouillon sur cet appareil · changements non publiés';
    return true;
  } catch {
    notice('Le navigateur n’a pas pu conserver le brouillon. Garde cet onglet ouvert et exporte-le avant de partir.');
    if (draftKey() === key) $('#save-status').textContent = 'Brouillon non enregistré sur cet appareil';
    return false;
  }
}
async function loadPage(page, { discard = false } = {}) {
  if (!PAGES[page] || state.busy || activeJobs()) return;
  if (!discard && !(await saveDraft())) return;
  state.busy = true; state.deployment++; const generation = sessionGeneration;
  controls(); notice(''); $('#save-status').textContent = 'Chargement de la dernière version…';
  try {
    const fresh = await git.load(page);
    if (generation !== sessionGeneration) return;
    const key = `${state.user.id || state.user.email}:${page}`;
    if (discard) await draftStore('delete', key);
    state.page = page; state.data = fresh.data; state.sha = fresh.sha; state.assets = []; state.dirty = false; state.jobs = [];
    state.pendingDraft = await draftStore('get', key).catch(() => null);
    if (state.pendingDraft && JSON.stringify(state.pendingDraft.data) === JSON.stringify(fresh.data)) {
      await draftStore('delete', key).catch(() => {}); state.pendingDraft = null;
    }
    $('#draft-notice').hidden = !state.pendingDraft;
    $('#save-status').textContent = 'Version enregistrée chargée · aucune modification';
    $('#breadcrumb').textContent = PAGES[page].label.toUpperCase();
    $('#page-title').innerHTML = `${esc(PAGES[page].label)}<span>.</span>`;
    $('#page-index').textContent = `/ ${String(Object.keys(PAGES).indexOf(page) + 1).padStart(2, '0')}`;
    $('#page-description').textContent = page === 'accueil' ? 'Choisis les images qui donnent le ton.' : 'Fais une place à tes dernières réalisations.';
    renderEditor(); renderNav(); renderJobs();
  } catch (error) { notice(error.message); $('#save-status').textContent = 'Chargement impossible · réessaie'; }
  finally { state.busy = false; controls(); }
}
function cover(key, title, description) {
  const item = state.data[key] || {};
  return `<article class="cover-card"><div class="cover-photo"><img src="${esc(previewImage(item.image))}" alt="${esc(item.alt || title)}"></div><div class="cover-copy"><h3>${title}</h3><p>${description}</p><button class="secondary" data-action="edit" data-list="${key}">Modifier la photo ↗</button></div></article>`;
}
function listSection(key, title, number) {
  const list = state.data[key] || [];
  const photos = key === 'galerie';
  return `<section class="section" data-section="${key}"><div class="section-title"><h2><span class="section-number">${number}</span>${title}</h2><div class="section-tools"><span class="count">${String(list.length).padStart(2, '0')} ${photos ? 'PHOTOS' : 'CONTENUS'}</span><button class="text-button" data-action="add" data-list="${key}">Ajouter par un lien ↗</button></div></div><div class="dropzone" data-drop="${key}"><div class="dropzone-copy"><span class="upload-icon" aria-hidden="true">↑</span><div><strong>Dépose tes ${photos ? 'photos' : 'photos ou vidéos'} ici.</strong><p>Ou sélectionne plusieurs fichiers sur ton appareil.${photos ? '' : ' Une vignette est créée pour chaque vidéo.'}</p></div></div><button class="secondary" data-action="upload" data-list="${key}">Importer ${photos ? 'des photos' : 'des médias'} <span>+</span></button></div>${list.length ? `<div class="cards-grid">${list.map((item, index) => card(item, index, key)).join('')}</div>` : '<div class="empty">Cette section est vide. Importe tes premières images pour la remplir.</div>'}</section>`;
}
function card(item, index, key) {
  const title = item.titre || item.legende || 'Sans titre';
  return `<article class="media-card"><div class="card-image"><img src="${esc(previewImage(item.image))}" alt="${esc(item.alt || title)}" loading="lazy"><span class="media-type">${item.video ? '▶ VIDÉO' : '↗ PHOTO'}</span><span class="media-position">${String(index + 1).padStart(2, '0')}</span></div><div class="card-body"><h3>${esc(title)}</h3><p>${esc(item.type || (item.style === 'polar' ? 'Polaroid' : 'Photographie'))}</p><div class="card-actions"><button class="edit" data-action="edit" data-list="${key}" data-index="${index}" aria-label="Modifier ${esc(title)}">Modifier ↗</button><button class="icon-button" data-action="up" data-list="${key}" data-index="${index}" aria-label="Monter ${esc(title)}" ${index === 0 ? 'disabled' : ''}>↑</button><button class="icon-button" data-action="down" data-list="${key}" data-index="${index}" aria-label="Descendre ${esc(title)}" ${index === state.data[key].length - 1 ? 'disabled' : ''}>↓</button><button class="icon-button delete" data-action="delete" data-list="${key}" data-index="${index}" aria-label="Retirer ${esc(title)}">×</button></div></div></article>`;
}
function renderEditor() {
  if (!state.data) { $('#editor').innerHTML = ''; return; }
  $('#editor').innerHTML = `<section class="section"><div class="section-title"><h2><span class="section-number">01</span>Le premier regard</h2><span>LES IMAGES D’OUVERTURE</span></div><div class="cover-grid">${cover('hero', 'La couverture', 'La première image que l’on découvre.')}${state.page === 'accueil' ? cover('manifeste', 'Le portrait', 'Toi, derrière la caméra.') : ''}</div></section>` +
    (state.page === 'accueil' ? listSection('projets', 'Les projets à l’affiche', '02') + listSection('galerie', 'Les instants à partager', '03') : `<section class="section"><label class="period-field">Période affichée <input id="period" value="${esc(state.data.periode)}" maxlength="80"></label></section>` + listSection('medias', 'Les réalisations', '02'));
  $('#period')?.addEventListener('input', event => { state.data.periode = event.target.value; markDirty(); });
  document.querySelectorAll('[data-drop]').forEach(zone => {
    zone.addEventListener('dragover', event => { event.preventDefault(); if (!state.busy && !activeJobs()) zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('drag-over'); if (!state.busy && !activeJobs() && !state.pendingDraft) addFiles(event.dataTransfer.files, zone.dataset.drop); });
  });
  controls();
}
$('#editor').addEventListener('error', event => {
  if (event.target.tagName === 'IMG') {
    event.target.hidden = true;
    const label = document.createElement('span'); label.className = 'error-placeholder'; label.textContent = 'Image indisponible · remplace-la'; event.target.parentElement.append(label);
  }
}, true);
$('#editor').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || state.busy || activeJobs()) return;
  const { action, list } = button.dataset; const index = button.dataset.index === undefined ? null : Number(button.dataset.index);
  if (action === 'upload') return chooseFiles(list);
  if (action === 'edit' || action === 'add') return openEditor(list, index, action === 'add');
  if (action === 'delete') {
    const item = state.data[list][index];
    if (!confirm(`Retirer « ${item.titre || item.legende || 'ce média'} » de cette page ? Le fichier original reste conservé.`)) return;
    state.data[list].splice(index, 1);
  } else {
    const next = index + (action === 'up' ? -1 : 1);
    if (next < 0 || next >= state.data[list].length) return;
    [state.data[list][index], state.data[list][next]] = [state.data[list][next], state.data[list][index]];
  }
  markDirty(); renderEditor();
});
const field = (name, label, value, hint = '', required = false) => `<label class="field">${label}<input name="${name}" value="${esc(value)}" ${required ? 'required' : ''} maxlength="2000">${hint ? `<small>${hint}</small>` : ''}</label>`;
const select = (name, label, value, options) => `<label class="field">${label}<select name="${name}">${options.map(([key, text]) => `<option value="${key}" ${value === key ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
function openEditor(list, index, isNew = false) {
  const single = ['hero', 'manifeste'].includes(list); const gallery = list === 'galerie';
  const item = isNew ? { titre: 'Nouveau projet', legende: 'Nouvelle photo', image: '', alt: '', video: '', lien: '', type: '', format: 'm-w', style: 'raw' } : clone(single ? state.data[list] : state.data[list][index]);
  state.dialog = { list, index, item, isNew, single };
  $('#dialog-title').textContent = single ? 'Changer le premier regard' : gallery ? 'Modifier la photographie' : 'Modifier le projet';
  $('#item-fields').innerHTML = `${item.image ? `<img class="dialog-preview" src="${esc(previewImage(item.image))}" alt="Aperçu du média">` : ''}<div class="dialog-upload"><button type="button" class="secondary" id="replace-image">Importer une ${single || gallery ? 'photo' : 'vignette'} ↑</button>${!single && !gallery ? '<button type="button" class="secondary" id="replace-video">Importer une vidéo ↑</button>' : ''}</div>` +
    (!single && !gallery ? `<div class="field-row">${field('titre', 'Titre', item.titre, '', true)}${field('type', 'Catégorie', item.type, 'Ex. Film de marque, Reel, Automobile…')}</div>` : '') +
    (gallery || list === 'manifeste' ? field('legende', 'Légende', item.legende, '', true) : '') +
    field('image', 'Adresse de la photo', item.image, 'L’import remplit ce champ automatiquement. Une URL HTTPS ou un chemin /img/… fonctionne aussi.') +
    field('alt', 'Description de l’image', item.alt, 'Quelques mots pour les personnes qui ne peuvent pas voir la photo.') +
    (!single && !gallery ? field('video', 'Adresse de la vidéo', item.video, 'Fichier vidéo direct en HTTPS. Laisse vide pour afficher uniquement la photo.') + field('lien', 'Lien au clic (facultatif)', item.lien, 'YouTube, Vimeo, Instagram… Sans lien, le clic ouvre la vidéo importée.') : '') +
    (list === 'medias' ? select('format', 'Format dans la grille', item.format, [['m-w','Large · 16/10'],['m-n','Portrait · 4/5'],['m-v','Vertical · 9/16'],['m-h','Demi-largeur · 16/9'],['m-f','Pleine largeur · 21/9']]) : '') +
    (gallery ? select('style', 'Présentation', item.style, [['raw','Photo brute'],['polar','Polaroid']]) : '');
  $('#replace-image').onclick = () => chooseFiles(list, 'image', true);
  if ($('#replace-video')) $('#replace-video').onclick = () => chooseFiles(list, 'video', true);
  $('#edit-dialog').showModal();
}
function applyDialog() {
  const dialog = state.dialog;
  for (const [name, value] of new FormData($('#item-form'))) dialog.item[name] = String(value).trim();
  if (dialog.single) state.data[dialog.list] = dialog.item;
  else if (dialog.isNew) state.data[dialog.list].push(dialog.item);
  else state.data[dialog.list][dialog.index] = dialog.item;
  $('#edit-dialog').close(); state.dialog = null; markDirty(); renderEditor();
  return dialog.item;
}
$('#item-form').addEventListener('submit', event => {
  event.preventDefault();
  for (const name of ['image', 'video', 'lien']) {
    const input = $(`[name="${name}"]`);
    if (input?.value.trim() && !safeURL(input.value)) { input.setCustomValidity('Utilise une URL HTTPS ou un chemin qui commence par /.'); input.reportValidity(); input.oninput = () => input.setCustomValidity(''); return; }
  }
  applyDialog();
});
$('#close-dialog').onclick = $('#cancel-dialog').onclick = () => $('#edit-dialog').close();
$('#edit-dialog').addEventListener('close', () => { state.dialog = null; });
function chooseFiles(list, kind, replacement = false) {
  const input = document.createElement('input'); input.type = 'file'; input.multiple = !replacement;
  input.accept = kind === 'video' ? VIDEO_ACCEPT : kind === 'image' || list === 'galerie' ? IMAGE_ACCEPT : `${IMAGE_ACCEPT},${VIDEO_ACCEPT}`;
  input.onchange = () => {
    if (!input.files.length) return;
    const item = replacement ? applyDialog() : null;
    addFiles(input.files, list, item, kind);
  };
  input.click();
}
function addFiles(files, list, target = null, expectedKind = null) {
  if (state.busy || activeJobs() || state.pendingDraft) return;
  for (const file of files) state.jobs.push({ id: crypto.randomUUID(), file, list, target, expectedKind, status: 'waiting', progress: 0, message: 'En attente', controller: new AbortController() });
  renderJobs(); controls(); runJobs();
}
let runningQueue = false;
async function runJobs() {
  if (runningQueue) return; runningQueue = true;
  try {
    for (const job of state.jobs) {
      if (job.status !== 'waiting') continue;
      job.status = 'running'; job.message = 'Préparation du fichier…'; renderJobs(); controls();
      try {
        const kind = fileKind(job.file);
        if (job.file.size === 0) throw new Error('Ce fichier est vide.');
        if ((job.list === 'galerie' || job.expectedKind === 'image') && kind !== 'image') throw new Error('Cet emplacement accepte uniquement une photo.');
        if (job.expectedKind === 'video' && kind !== 'video') throw new Error('Choisis un fichier vidéo pour cet emplacement.');
        if (job.file.size > (kind === 'image' ? 30 * 1024 * 1024 : state.storage?.limits?.video || 100 * 1024 * 1024)) throw new Error(`Fichier trop volumineux : limite de ${kind === 'image' ? 30 : Math.round((state.storage?.limits?.video || 100 * 1024 * 1024) / 1024 / 1024)} Mo.`);
        let result;
        if (state.storage?.configured) {
          const auth = await mediaRequest(token, { kind, size: job.file.size });
          result = await uploadCloud(job.file, auth, { signal: job.controller.signal, progress: (percent, retry) => {
            job.progress = percent; job.message = retry ? `Connexion interrompue · nouvelle tentative ${retry}/3` : `Transfert ${percent} %`; updateJob(job);
          } });
        } else if (kind === 'image') {
          const asset = await optimizePhoto(job.file);
          if (job.controller.signal.aborted) throw new DOMException('Import annulé.', 'AbortError');
          state.assets.push(asset); result = { image: asset.path };
        } else throw new Error('Le stockage vidéo n’est pas encore connecté. Configure Cloudinary dans Netlify, puis réessaie. Tu peux aussi utiliser un lien vidéo déjà hébergé.');
        if (job.controller.signal.aborted) throw new DOMException('Import annulé.', 'AbortError');
        if (job.target) Object.assign(job.target, result);
        else {
          const title = job.file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
          state.data[job.list].push(job.list === 'galerie' ? { ...result, legende: title, alt: title, style: 'raw' } : { ...result, titre: title, type: kind === 'video' ? 'Film' : 'Photographie', alt: title, lien: '', ...(job.list === 'medias' ? { format: 'm-w' } : {}) });
        }
        job.status = 'done'; job.progress = 100; job.message = 'Prêt dans le brouillon · à publier'; job.file = null;
        markDirty(); await saveDraft(); renderEditor();
      } catch (error) {
        job.status = error.name === 'AbortError' ? 'cancelled' : 'failed';
        job.message = error.name === 'AbortError' ? 'Import annulé' : error.message;
      }
      renderJobs(); controls();
    }
  } finally { runningQueue = false; controls(); }
}
function updateJob(job) {
  const row = document.getElementById(`job-${job.id}`);
  if (!row) return;
  row.querySelector('progress').value = job.progress;
  row.querySelector('.upload-detail').textContent = job.message;
}
function renderJobs() {
  $('#imports').hidden = !state.jobs.length;
  $('#upload-list').innerHTML = state.jobs.map(job => `<li id="job-${job.id}" class="upload-row ${job.status === 'failed' ? 'failed' : ''}"><span class="upload-name">${esc(job.name || (job.name = job.file?.name))}</span><span class="upload-detail">${esc(job.message)}</span>${['running','waiting'].includes(job.status) ? `<button class="text-button" data-job="${job.id}" data-job-action="cancel">Annuler</button>` : job.status === 'failed' ? `<button class="text-button" data-job="${job.id}" data-job-action="retry">Réessayer</button>` : ''}<progress max="100" value="${job.progress}" aria-label="Progression de ${esc(job.name)}"></progress></li>`).join('');
}
$('#upload-list').onclick = event => {
  const button = event.target.closest('[data-job]'); if (!button) return;
  const job = state.jobs.find(job => job.id === button.dataset.job);
  if (button.dataset.jobAction === 'cancel') { job.controller.abort(); if (job.status === 'waiting') { job.status = 'cancelled'; job.message = 'Import annulé'; renderJobs(); controls(); } }
  else if (!activeJobs() && !state.busy) { job.status = 'waiting'; job.controller = new AbortController(); runJobs(); }
};
$('#pages').onclick = event => { const button = event.target.closest('[data-page]'); if (button && button.dataset.page !== state.page) loadPage(button.dataset.page); };
$('#restore-draft').onclick = () => {
  const draft = state.pendingDraft; if (!draft) return;
  if (draft.baseSha !== state.sha) notice('Ce brouillon a été créé sur une version plus ancienne. Exporte-le avant de recharger la page à jour : la publication empêchera d’écraser les changements faits ailleurs.');
  state.data = draft.data; state.sha = draft.baseSha; state.assets = draft.assets || []; state.pendingDraft = null;
  $('#draft-notice').hidden = true; markDirty(); renderEditor();
};
$('#discard-draft').onclick = async () => {
  if (!confirm('Supprimer le brouillon enregistré sur cet appareil ?')) return;
  try { await draftStore('delete', draftKey()); state.pendingDraft = null; $('#draft-notice').hidden = true; controls(); }
  catch { notice('Impossible de supprimer le brouillon. Réessaie.'); }
};
$('#reload').onclick = () => {
  if ((state.dirty || state.pendingDraft) && !confirm('Recharger la version enregistrée et abandonner le brouillon de cette page ? Exporte-le d’abord si tu veux le garder.')) return;
  loadPage(state.page, { discard: true });
};
$('#export').onclick = () => {
  const exported = state.pendingDraft || { data: state.data, baseSha: state.sha, assets: state.assets };
  const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `tom-${state.page}-brouillon.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('#preview').onclick = () => {
  const id = crypto.randomUUID();
  const data = clone(state.data);
  const replace = value => {
    if (!value || typeof value !== 'object') return;
    if (value.image) value.image = previewImage(value.image);
    Object.values(value).forEach(value => { if (typeof value === 'object') replace(value); });
  };
  replace(data);
  try {
    // sessionStorage is copied into a same-origin child tab. No authentication data is passed.
    for (let i = sessionStorage.length - 1; i >= 0; i--) { const key = sessionStorage.key(i); if (key.startsWith('tom-preview:')) sessionStorage.removeItem(key); }
    sessionStorage.setItem(`tom-preview:${id}`, JSON.stringify({ page: state.page, data }));
    const tab = window.open(`${PAGES[state.page].url}?preview=${id}`, '_blank');
    if (!tab) throw new Error('Autorise les fenêtres contextuelles pour ouvrir l’aperçu.');
  } catch (error) { notice(error.name === 'QuotaExceededError' ? 'L’aperçu contient trop de nouvelles photos pour ce navigateur. Publie un premier lot ou connecte Cloudinary.' : error.message); }
};
$('#publish').onclick = async () => {
  if (state.busy || activeJobs() || state.pendingDraft || !state.dirty) return;
  const errors = validatePage(state.page, state.data);
  if (errors.length) { notice(errors.join('\n')); $('#notice').scrollIntoView({ block: 'center' }); return; }
  await saveDraft(); state.busy = true; controls(); notice('');
  try {
    const published = clone(state.data); const page = state.page;
    const result = await git.publish(page, published, state.sha, state.assets);
    state.sha = result.sha; state.dirty = false;
    // Keep local thumbnails until the new deployment serves their files.
    await saveChain.catch(() => {}); await draftStore('delete', draftKey()).catch(() => {});
    $('#save-status').textContent = 'Enregistré · mise en ligne en cours';
    notice('Les changements sont enregistrés. Le site prépare leur mise en ligne ; tu peux continuer à travailler.', true);
    watchDeployment(page, published, ++state.deployment);
  } catch (error) { notice(error.message); $('#save-status').textContent = 'Publication non confirmée · brouillon conservé'; }
  finally { state.busy = false; controls(); }
};
async function watchDeployment(page, published, generation) {
  for (let attempt = 0; attempt < 18; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    if (generation !== state.deployment || !state.user) return;
    try {
      const response = await fetch(`/${PAGES[page].path}?published=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (response.ok && JSON.stringify(await response.json()) === JSON.stringify(published)) {
        if (!state.dirty) { $('#save-status').textContent = 'À jour · changements visibles sur le portfolio'; notice('C’est en ligne. Tes nouvelles images sont visibles sur le portfolio.', true); }
        return;
      }
    } catch { /* Deployment may temporarily be unavailable; preserve the saved state. */ }
  }
  if (generation === state.deployment && !state.dirty) notice('Les changements sont enregistrés, mais leur mise en ligne n’a pas encore été confirmée. Vérifie le dernier déploiement dans Netlify.');
}
async function enter(user) {
  if (!user || state.user) return;
  state.user = user; sessionGeneration++;
  $('#login-screen').hidden = true; $('#studio').hidden = false; $('#logout').hidden = false; $('#mobile-logout').hidden = false;
  $('#account-name').textContent = user.user_metadata?.full_name?.split(' ')[0] || 'Tom';
  window.netlifyIdentity?.close();
  const generation = sessionGeneration;
  mediaRequest(token).then(config => {
    if (generation !== sessionGeneration) return;
    state.storage = config;
    $('#media-status').textContent = config.configured ? `Photos + vidéos connectées · vidéos ${Math.round(config.limits.video / 1024 / 1024)} Mo max` : 'Photos disponibles · stockage vidéo à connecter';
    if (!config.configured && $('#notice').hidden) notice(config.error);
  }).catch(error => { if (generation === sessionGeneration) { state.storage = null; $('#media-status').textContent = 'Photos disponibles · stockage vidéo indisponible'; if ($('#notice').hidden) notice(error.message); } });
  await loadPage(state.page);
}
async function logout() {
  if (state.busy || activeJobs()) return;
  if (!(await saveDraft())) return;
  try { await window.netlifyIdentity.logout(); } catch { notice('Déconnexion impossible. Réessaie.'); }
}
function exitStudio() {
  state.jobs.forEach(job => job.controller.abort());
  sessionGeneration++; state.deployment++; state.user = null; state.data = null; state.storage = null; state.dirty = false; state.assets = []; state.jobs = []; state.pendingDraft = null;
  $('#studio').hidden = true; $('#login-screen').hidden = false; $('#logout').hidden = true; $('#mobile-logout').hidden = true;
  $('#editor').innerHTML = ''; $('#edit-dialog').close(); renderNav();
}
$('#logout').onclick = $('#mobile-logout').onclick = logout;
$('#login').onclick = () => {
  if (!window.netlifyIdentity) { $('#login-info').textContent = 'Le service de connexion ne s’est pas chargé. Vérifie Internet, puis recharge cette page.'; return; }
  window.netlifyIdentity.open('login');
};
$('#year').textContent = new Date().getFullYear(); renderNav();
window.addEventListener('beforeunload', event => { if (state.dirty || activeJobs() || state.busy) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.hidden) saveDraft(); });
window.addEventListener('offline', () => { if (state.user) notice('Tu es hors connexion. Ton brouillon reste sur cet appareil. Les imports en cours vont réessayer automatiquement.'); });
function initIdentity() {
  const identity = window.netlifyIdentity;
  if (!identity) { $('#login-info').textContent = 'Connexion indisponible. Vérifie Internet et la configuration Netlify Identity.'; return; }
  identity.on('init', user => { if (user) enter(user); });
  identity.on('login', user => enter(user)); identity.on('logout', exitStudio);
  identity.on('error', error => { const message = error?.message || 'La connexion a échoué. Réessaie.'; if (state.user) notice(message); else $('#login-info').textContent = message; });
  if (identity.currentUser()) enter(identity.currentUser()); else identity.init();
}
if (document.readyState === 'complete') initIdentity(); else window.addEventListener('load', initIdentity, { once: true });
