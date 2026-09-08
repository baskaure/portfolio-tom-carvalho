# Tom Carvalho — portfolio et studio

Site statique et panel d’administration sur mesure à `/admin/`, en français et adapté au téléphone. Le studio remplace Decap, en conservant les fichiers JSON existants, Netlify Identity et Git Gateway. Aucun compte GitHub n’est nécessaire pour Tom.

## Ce que Tom peut faire

- Modifier la couverture, le portrait, les projets et la galerie de l’accueil, ainsi que les cinq pages de services.
- Déposer plusieurs photos ou vidéos, suivre chaque import, l’annuler ou réessayer un fichier en échec.
- Modifier les titres, descriptions, catégories, liens, formats et ordre des médias.
- Prévisualiser le véritable portfolio avec ses changements avant publication.
- Reprendre un brouillon, y compris ses nouvelles photos optimisées, après avoir fermé ou rechargé le navigateur.
- Publier une page avec ses photos dans un seul commit. La mise en ligne Netlify est vérifiée séparément : « enregistré » ne veut pas dire « déjà en ligne ».

## Activer le studio sur le site existant

La refonte doit être déployée sur Netlify pour remplacer l’ancienne administration. Les imports vidéo nécessitent aussi un compte Cloudinary ; aucun identifiant n’est inclus dans le projet.

1. Conserver le site Netlify relié à `baskaure/portfolio-tom-carvalho`, branche `main`. Le fichier `netlify.toml` définit la racine publiée et le dossier des fonctions.
2. Vérifier **Netlify Identity**, les inscriptions **sur invitation uniquement**, et **Git Gateway** relié au dépôt GitHub.
3. Conserver le compte invité de Tom, ou l’inviter s’il n’existe pas encore. Les liens d’invitation et de récupération sont gérés depuis l’accueil et `/admin/`.
4. Déployer cette version. Vérifier que la fonction `media-sign` apparaît dans les fonctions du site.
5. Les photos JPG, PNG, WebP et AVIF peuvent alors être importées sans stockage supplémentaire. Elles sont converties en WebP, ramenées à 2 400 px au maximum et limitées à 850 Kio après optimisation pour ne pas saturer Git Gateway. Les fichiers source ne sont pas modifiés.

## Connecter les vidéos (une seule fois)

1. Créer le compte Cloudinary de Tom et ouvrir les paramètres **API Keys** de son environnement de médias.
2. Dans les variables d’environnement du site Netlify, ajouter les quatre valeurs suivantes, disponibles pour les **Functions** :

```text
CLOUDINARY_CLOUD_NAME = nom du cloud Cloudinary
CLOUDINARY_API_KEY = clé API Cloudinary
CLOUDINARY_API_SECRET = secret API Cloudinary
ADMIN_EMAILS = adresse du compte Netlify Identity de Tom
```

`ADMIN_EMAILS` peut contenir plusieurs adresses séparées par des virgules. Il faut utiliser les adresses exactes des comptes invités autorisés. Ne pas mettre de secret dans le HTML, dans un fichier de l’admin ou dans Git. Aucun preset d’upload unsigned n’est nécessaire.

3. Redéployer le site après avoir enregistré ces valeurs.
4. Se connecter à `/admin/`. Le statut doit afficher **Photos + vidéos connectées**.
5. Importer une photo, une petite vidéo MP4, puis une vidéo de plus de 12 Mo afin de vérifier le transfert par morceaux. Publier, attendre le statut de mise en ligne, et vérifier la lecture sur ordinateur et téléphone.

Le navigateur envoie les médias directement à Cloudinary. La fonction Netlify vérifie le jeton Identity et l’adresse autorisée, puis signe les paramètres d’upload côté serveur. Le secret n’est jamais transmis au navigateur. Les fichiers volumineux ne passent ni par les fonctions Netlify ni par Git Gateway. L’implémentation suit les [uploads par morceaux Cloudinary](https://cloudinary.com/documentation/upload_images#chunked_asset_upload) et les [signatures d’authentification](https://cloudinary.com/documentation/authentication_signatures).

Limite initiale : **100 Mio par vidéo**, **30 Mio par photo**. Pour modifier la limite vidéo du studio, ajouter `MEDIA_MAX_VIDEO_MB` dans Netlify (maximum 2 000). Cette valeur ne relève pas la limite du compte Cloudinary : vérifier ses quotas et limites de fichiers avant de l’augmenter. Les signatures limitent les formats ; les limites de taille et quotas du fournisseur restent l’autorité côté stockage.

Les MOV, MP4, WebM et M4V sont acceptés ; les URLs de diffusion vidéo demandent une conversion MP4/H.264 et une vignette JPEG. Avec Cloudinary, les photos HEIC/HEIF et GIF sont également acceptées. Sans Cloudinary, il faut les exporter en JPG. Une première lecture peut nécessiter le temps de génération de la vidéo ou de sa vignette par Cloudinary ; MP4/H.264 est l’export conseillé.

## Publication, brouillons et reprises

Les JSON dans `data/` restent la source de vérité. Le studio lit la branche courante avant chaque publication, sans cache. Il crée les blobs, un arbre et un commit atomique, puis avance `main` sans `force`. Si un autre commit a modifié une autre page entre-temps, il réessaie sur le nouveau parent. Si la même page a changé, il conserve le brouillon et bloque l’écrasement : exporter le brouillon, recharger la version récente et reporter les changements voulus.

Les brouillons sont conservés dans IndexedDB, par compte et par page, sur l’appareil utilisé. Ils ne sont pas synchronisés entre appareils. Le bouton **Exporter le brouillon** donne un fichier JSON comprenant les nouvelles photos optimisées ; c’est une sauvegarde de secours pour récupération manuelle, pas un import automatique. Ne pas vider les données du navigateur avant publication ou export.

Un transfert Cloudinary réessaie jusqu’à trois fois le morceau interrompu. Une fermeture d’onglet interrompt le transfert en cours : il faut resélectionner ce fichier après réouverture. Les médias déjà intégrés au brouillon restent disponibles. Une erreur sur un fichier n’efface pas les autres imports réussis. Ne publier qu’après avoir vérifié les résultats de la liste d’imports.

Retirer un média supprime son emplacement dans la page, sans détruire le fichier source dans Git ou Cloudinary. Cela évite de casser une autre page utilisant le même fichier. Faire le ménage dans Cloudinary seulement après avoir vérifié qu’un média n’est plus utilisé. Un import abandonné peut donc rester dans Cloudinary.

## Lancer et tester

```sh
npm run dev
npm test
```

Le serveur statique est accessible sur `http://localhost:8080`. Le portfolio public y fonctionne ; la connexion, les écritures Git et la fonction de signature nécessitent Netlify ou Netlify Dev relié au site. Le serveur statique seul n’émule pas ces services.

Les tests unitaires couvrent encodage Unicode, validation des liens, listes vides, sauvegarde atomique, conflits concurrents, réponse perdue après publication, session expirée, découpage vidéo, nouvelles tentatives, annulation, rejet de formats et autorisation/signature serveur. Ils ne publient rien et n’utilisent pas de compte externe.

Le test de navigateur `tests/browser-check.cjs` utilise Playwright, un serveur local sur le port 8080 et des réponses Identity/Git/Cloudinary simulées. Installer Playwright séparément pour l’exécuter (`npm install --no-save playwright`, puis `npx playwright install chromium`), puis lancer `npm run test:browser`. Il vérifie de vraies opérations navigateur et de vrais fichiers image, sans publier sur le dépôt distant.

La recette finale sur les vrais comptes est obligatoire après configuration : identité, import Cloudinary, publication Git Gateway et déploiement Netlify ne peuvent pas être certifiés par des tests simulés.

## Fichiers principaux

```text
admin/index.html, style.css, app.mjs — interface du studio
admin/api.mjs                      — Git Gateway, validation et brouillons
admin/media.mjs                    — optimisation photo et transfert Cloudinary
netlify/functions/media-sign.js    — signature des imports, accès réservé
js/content.js, js/media-url.mjs    — rendu public et aperçu, lecture vidéo au clic
css/style.css                     — portfolio public
netlify.toml                      — déploiement et règles de cache
```
