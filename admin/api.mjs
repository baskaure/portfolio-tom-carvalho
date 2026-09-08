export const PAGES = {
  accueil: { label: 'Accueil', path: 'data/accueil.json', url: '/' },
  contenu: { label: 'Création de contenu', path: 'data/services/contenu.json', url: '/services/contenu.html' },
  institutionnel: { label: 'Institutionnel', path: 'data/services/institutionnel.json', url: '/services/institutionnel.html' },
  aftermovies: { label: 'Aftermovies', path: 'data/services/aftermovies.json', url: '/services/aftermovies.html' },
  shooting: { label: 'Shooting photo', path: 'data/services/shooting.json', url: '/services/shooting.html' },
  etalonnage: { label: 'Étalonnage', path: 'data/services/etalonnage.json', url: '/services/etalonnage.html' },
};

export class ApiError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}

export const encode = text => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};
export const decode = text => new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g, '')), c => c.charCodeAt(0)));

import { safeURL } from '../js/media-url.mjs';
export { safeURL };

export function validatePage(page, data) {
  const errors = [];
  const checkMedia = (item, label, video = true) => {
    if (!safeURL(item?.image)) errors.push(`${label} : ajoute une photo ou une vignette valide.`);
    if (item?.video && (!video || !safeURL(item.video))) errors.push(`${label} : l’adresse de la vidéo doit être un lien HTTPS direct.`);
    if (item?.lien && !safeURL(item.lien)) errors.push(`${label} : le lien doit commencer par https:// ou /.`);
  };
  checkMedia(data?.hero, 'Photo de couverture', false);
  if (page === 'accueil') checkMedia(data?.manifeste, 'Portrait', false);
  for (const key of page === 'accueil' ? ['projets', 'galerie'] : ['medias']) {
    if (!Array.isArray(data?.[key])) { errors.push(`La liste ${key} est invalide.`); continue; }
    data[key].forEach((item, i) => {
      const label = `${key === 'galerie' ? 'Photo' : 'Projet'} ${i + 1}`;
      checkMedia(item, label, key !== 'galerie');
      if (!(key === 'galerie' ? item.legende : item.titre)?.trim()) errors.push(`${label} : renseigne ${key === 'galerie' ? 'une légende' : 'un titre'}.`);
      if (key === 'medias' && !['m-w', 'm-n', 'm-v', 'm-h', 'm-f'].includes(item.format)) errors.push(`${label} : choisis un format valide.`);
    });
  }
  return errors;
}

export class GitStore {
  constructor(token, fetcher = fetch, pause = ms => new Promise(r => setTimeout(r, ms))) {
    this.token = token; this.fetch = fetcher.bind(globalThis); this.pause = pause;
  }
  async request(path, { method = 'GET', body } = {}) {
    const url = new URL(`/.netlify/git/github${path}`, globalThis.location?.origin || 'http://localhost');
    if (method === 'GET') url.searchParams.set('_fresh', `${Date.now()}-${Math.random()}`);
    let response;
    try {
      response = await this.fetch(url.toString(), {
        method, cache: 'no-store', signal: AbortSignal.timeout(45000),
        headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('Connexion interrompue. Ton brouillon est conservé ; réessaie après avoir vérifié le réseau.');
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        401: 'Ta session a expiré. Reconnecte-toi : ton brouillon est conservé.',
        403: 'Ce compte n’a pas accès à la publication. Vérifie ses droits Netlify et Git Gateway.',
        404: 'Le contenu est introuvable. Vérifie que Git Gateway est activé et relié au dépôt GitHub.',
      };
      throw new ApiError(messages[response.status] || `Publication indisponible (${response.status}). Réessaie dans un instant.`, response.status);
    }
    return result;
  }
  async head() { return (await this.request('/branches/main')).commit.sha; }
  async readAt(page, ref) {
    if (!PAGES[page]) throw new Error('Page inconnue.');
    const file = await this.request(`/contents/${PAGES[page].path}?ref=${encodeURIComponent(ref)}`);
    return { data: JSON.parse(decode(file.content)), sha: file.sha };
  }
  async load(page) { return this.readAt(page, await this.head()); }

  // One atomic commit contains the JSON and its optimized images. Never force main.
  // Rebase only when a concurrent commit did not modify this page.
  async publish(page, data, baseSha, assets = []) {
    const errors = validatePage(page, data);
    if (errors.length) throw new Error(errors.join('\n'));
    const content = JSON.stringify(data, null, 2) + '\n';
    const jsonBlob = await this.request('/git/blobs', { method: 'POST', body: { content, encoding: 'utf-8' } });
    const treeEntries = [{ path: PAGES[page].path, mode: '100644', type: 'blob', sha: jsonBlob.sha }];
    const used = JSON.stringify(data);
    for (const asset of assets.filter(a => used.includes(a.path))) {
      if (!/^\/img\/uploads\/[a-zA-Z0-9-]+\.webp$/.test(asset.path)) throw new Error('Chemin de photo invalide.');
      const blob = await this.request('/git/blobs', { method: 'POST', body: { content: asset.base64, encoding: 'base64' } });
      treeEntries.push({ path: asset.path.slice(1), mode: '100644', type: 'blob', sha: blob.sha });
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const head = await this.head();
      const current = await this.readAt(page, head);
      // Reconcile a response lost after a successful atomic commit.
      if (current.sha === jsonBlob.sha) return { sha: jsonBlob.sha, commit: head };
      if (current.sha !== baseSha) throw new ApiError('Cette page a été modifiée depuis son ouverture. Ton brouillon est conservé. Exporte-le, puis recharge la dernière version avant de reporter tes changements.', 409);
      const parent = await this.request(`/git/commits/${head}`);
      const tree = await this.request('/git/trees', { method: 'POST', body: { base_tree: parent.tree.sha, tree: treeEntries } });
      const commit = await this.request('/git/commits', { method: 'POST', body: { message: `admin: modification ${PAGES[page].label}`, tree: tree.sha, parents: [head] } });
      try {
        await this.request('/git/refs/heads/main', { method: 'PATCH', body: { sha: commit.sha, force: false } });
        return { sha: jsonBlob.sha, commit: commit.sha };
      } catch (error) {
        if (![0, 409, 422, 500, 502, 503, 504].includes(error.status) || attempt === 3) throw error;
        await this.pause(500 * (attempt + 1));
      }
    }
  }
}

let database;
async function db() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('tom-studio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}
export async function draftStore(action, key, value) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('drafts', action === 'get' ? 'readonly' : 'readwrite');
    const store = tx.objectStore('drafts');
    const request = action === 'put' ? store.put(value, key) : store[action](key);
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Brouillon non enregistré.'));
  });
}
