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

Vidéos : préférer un lien YouTube/Vimeo (champ *Lien*) ou un .mp4 court et compressé (< 20 Mo) dans le champ *Vidéo*
(lecture muette au survol, l'image sert de vignette). Les fichiers uploadés sont commités dans `img/`.

## Lancer

Aucun build : ouvrir `index.html` dans un navigateur, ou servir le dossier :

```
python3 -m http.server
```

Les polices (Anton, Oswald, Archivo, IBM Plex Mono, Caveat) sont chargées via Google Fonts.
