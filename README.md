# Tom Carvalho — Portfolio

Portfolio de Tom Carvalho, vidéaste indépendant. Site statique une page, esthétique affiche grunge (noir / rouge / papier), sans framework ni dépendance.

## Structure

```
index.html      — page d'accueil (hero affiche, manifeste, projets vidéo, galerie photo, services, contact)
services/       — une page par prestation (contenu, institutionnel, aftermovies, shooting, etalonnage)
data/           — médias du site en JSON (édités via l'admin, lus par js/content.js)
admin/          — back-office Decap CMS (/admin)
css/style.css   — tous les styles
js/main.js      — reveals au scroll + bascule clair/sombre de la nav
js/content.js   — injecte les médias de data/*.json dans les pages
img/            — photos + texture halftone (uploads images de l'admin)
video/          — clips .mp4 uploadés via l'admin
netlify.toml    — config Netlify
```

## Admin des médias (`/admin`)

Back-office [Decap CMS](https://decapcms.org) : photos du hero et du manifeste, cartes projets, galerie photo,
et pour chaque page service la photo de fond + la grille de contenus (image ou vidéo, format, titre, type, lien).
Chaque sauvegarde crée un commit sur `main` → Netlify redéploie le site (~30 s).

Le HTML garde une version statique des médias : si `data/*.json` ne charge pas (ouverture en `file://`), la page
reste lisible. La source de vérité est le JSON.

### Mise en place (une seule fois, sur Netlify)

1. Créer le site Netlify depuis le repo GitHub (build command vide, publish directory `.`).
2. **Site settings → Identity → Enable Identity**, puis *Registration* → **Invite only**.
3. **Identity → Services → Git Gateway → Enable**.
4. **Identity → Invite users** → inviter l'adresse de Tom. Le mail d'invitation ouvre le site, qui redirige vers `/admin`.
5. Se connecter sur `https://<site>.netlify.app/admin/`.

Vidéos : préférer un lien YouTube/Vimeo (champ *Lien*). Pour la lecture au survol (champ *Vidéo*), héberger le .mp4
ailleurs (Cloudinary, Bunny.net, Cloudflare R2…) et coller son URL directe via **Insérer depuis une URL** dans la
fenêtre média. L'upload direct d'une vidéo dans le dépôt ne passe pas (voir Dépannage). Les images uploadées sont
commitées dans `img/`.

### Dépannage

**« Échec de l'enregistrement de l'entrée : API_ERROR: Update is not a fast forward »**
Decap relit le SHA de `main` juste avant de committer. Git Gateway (proxy Netlify) renvoie parfois une valeur
périmée pendant ~1 minute après un commit précédent (ex. un upload fait depuis l'onglet *Médias*, qui crée son
propre commit). GitHub refuse alors le commit basé sur l'ancien SHA. Rien n'est perdu : le brouillon reste ouvert.

- Attendre une minute et cliquer à nouveau sur **Publier**.
- Uploader les images **depuis le champ Image de l'entrée**, pas depuis l'onglet *Médias* : fichier et JSON
  partent alors dans un seul commit et le problème ne se pose pas.
- Côté dev : toujours `git pull` avant de pousser, les commits `admin: …` arrivent sur `main` sans passer par
  la copie locale. Ne jamais `push --force` sur `main`.

**« API error » à l'upload d'une vidéo (ou d'une grosse image)**
Git Gateway envoie le fichier en base64 à l'API GitHub et échoue au-delà d'environ 1 Mo (500 côté gateway,
Decap n'affiche qu'un « API error » générique). Pas de réglage possible côté site : compresser les images
(< 1 Mo, 1600–2000 px suffisent) et héberger les vidéos hors du dépôt (URL directe .mp4).

**Git Gateway est déprécié par Netlify** (toujours fonctionnel, mais plus corrigé). Si les erreurs deviennent
gênantes, passer au backend `github` : Tom a besoin d'un compte GitHub avec accès en écriture au dépôt, on crée
une OAuth App GitHub (callback `https://api.netlify.com/auth/done`), on l'installe dans
*Netlify → Access & security → OAuth → Install provider → GitHub*, puis dans `admin/config.yml` :

```yaml
backend:
  name: github
  repo: baskaure/portfolio-tom-carvalho
  branch: main
```

Decap parle alors directement à l'API GitHub (plus de SHA périmé, upload jusqu'à ~100 Mo). Alternative sans
compte GitHub pour Tom : stocker les médias hors Git via `media_library: { name: cloudinary }` (compte Cloudinary
gratuit), ce qui supprime aussi les commits d'upload.

## Lancer

Aucun build : ouvrir `index.html` dans un navigateur, ou servir le dossier :

```
python3 -m http.server
```

Les polices (Anton, Oswald, Archivo, IBM Plex Mono, Caveat) sont chargées via Google Fonts.
