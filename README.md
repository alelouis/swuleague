# swuleague

Suivi des ligues locales [Star Wars Unlimited](https://www.starwarsunlimited.com/), semaine après semaine.

- **Site en ligne** : <https://swuleague.alelouis.workers.dev> : classements animés par boutique, import des résultats depuis melee.gg, espace organisateurs. Hébergé gratuitement sur Cloudflare (voir [Site en ligne](#site-en-ligne-cloudflare)).
- **Images de classement** : images WebP combinant classement général et résultats d'étape, prêtes à partager sur Discord. Générées par `image.py` à partir des CSV, ou directement depuis le site (bouton « Image étape N »).

## Installation

```bash
pip install .
```

## Utilisation

```bash
# Générer les images pour toutes les boutiques (set courant)
python image.py

# Générer pour une boutique spécifique
python image.py -b all4play

# Générer pour un set spécifique
python image.py -s set-7

# Combiner les deux
python image.py -s set-7 -b cercle-du-jeu
```

## Site en ligne (Cloudflare)

<https://swuleague.alelouis.workers.dev> : un Worker Cloudflare (TypeScript) et une base D1 (SQLite), dans [`worker/`](worker/). Détails techniques, développement local et procédure de mise en ligne : [`worker/README.md`](worker/README.md).

> **Source des données** : depuis la mise en ligne, c'est la base D1 qui fait foi. Les imports et modifications faits sur le site ne sont **pas** recopiés dans les CSV de `data/`, qui ont servi à la migration initiale.

### Pour les joueurs

Aucun compte. Pour chaque boutique :

- un curseur d'étape continu : les lignes glissent d'un rang à l'autre et les totaux défilent ; ▶ rejoue toute la saison ;
- le détail de l'étape (V/D/N, points par catégorie), le suivi d'un joueur, la progression des recrues ;
- le bouton « Image étape N » qui télécharge l'image de classement, dessinée dans le navigateur avec la même mise en page que `image.py`.

### Pour les organisateurs

| Rôle | Peut faire |
|---|---|
| **Organisateur** | Importer / supprimer des étapes et gérer le recrutement **de ses boutiques** |
| **Administrateur** | Tout : page **Gestion** (sets, boutiques, set en cours, alias, comptes) |

Le compte Discord **wiknuw** est le propriétaire permanent (`OWNER_DISCORD_ID` dans [`worker/wrangler.jsonc`](worker/wrangler.jsonc)).

**Donner accès à un organisateur** :

1. Lui envoyer le lien du site ; il clique sur « Organisateurs » et se connecte avec Discord.
2. Sa demande apparaît dans **Gestion → Organisateurs**.
3. Choisir le rôle « Organisateur », cocher ses boutiques, « Enregistrer ». « Refusé » retire l'accès et ferme ses sessions.

**Importer une étape** : page de la boutique → « Importer une étape » → lien du tournoi melee.gg (`https://melee.gg/Tournament/View/<id>`) → « Prévisualiser ». On peut corriger un pseudo, exclure un joueur ou ajuster un score avant d'enregistrer ; les joueurs jamais vus dans la ligue sont marqués *nouveau* (changement de pseudo → ajouter un alias dans Gestion). Le copié-collé du classement melee.gg reste possible en secours.

**Nouveau set** : Gestion → « Nouveau set » avec « Définir comme set en cours » coché. L'accueil bascule dessus et toutes les boutiques repartent à zéro ; les sets précédents restent consultables.

### Ressources déployées

| Ressource | Valeur |
|---|---|
| Worker Cloudflare | `swuleague` → <https://swuleague.alelouis.workers.dev> |
| Base D1 | `swuleague` (région Europe de l'Ouest), id dans `worker/wrangler.jsonc` |
| Application Discord | « SWU League », client id `1563263485402415134`, redirection `https://swuleague.alelouis.workers.dev/auth/callback` |
| Secret | `DISCORD_CLIENT_SECRET`, secret Wrangler uniquement (jamais dans le dépôt) |

Commandes courantes (depuis `worker/`) :

```bash
npm run deploy                                                   # publier une modification du code
npx wrangler d1 export swuleague --remote --output backup.sql    # sauvegarde de la base
npx wrangler tail swuleague                                      # journaux en direct
npx wrangler secret put DISCORD_CLIENT_SECRET                    # remplacer le secret Discord
```

## Application web (version locale Flask)

Prototype local à partir duquel le site Cloudflare a été écrit. Il travaille directement sur les CSV de `data/` et n'est plus nécessaire pour le site en ligne. Il permet de suivre les ligues semaine après semaine : classements par boutique (avec évolution ▲▼ et navigation par étape), import d'une étape depuis un lien melee.gg, gestion du recrutement et téléchargement de l'image WebP de chaque étape.

```bash
uv run flask --app app run            # http://127.0.0.1:5000
```

**Importer une étape** : sur la page d'une boutique, « Importer une étape », coller le lien du tournoi (`https://melee.gg/Tournament/View/<id>`), choisir le numéro d'étape puis « Prévisualiser ». Le classement de la dernière ronde terminée est récupéré ; on peut corriger un pseudo, exclure un joueur, ajuster un score avant d'enregistrer. Les joueurs jamais vus dans la ligue sont marqués *nouveau* (pratique pour repérer un changement de pseudo à ajouter dans `PLAYER_ALIASES`). Le copié-collé melee.gg reste possible en secours.

L'application lit et écrit directement les CSV de `data/` (le lien melee.gg est noté en tête du fichier : `# melee: <url>`). Pensez à commiter `data/` pour déclencher la génération des images par la CI.

**Accès admin** : par défaut tout le monde peut modifier. Pour protéger les modifications (import, suppression, recrutement) :

```bash
SWULEAGUE_ADMIN_PASSWORD=motdepasse SWULEAGUE_SECRET_KEY=clé-aléatoire uv run flask --app app run --host 0.0.0.0
```

## Données

Les résultats sont stockés en CSV dans `data/<set>/<boutique>/etape_NN.csv` :

```csv
joueur,victoires,defaites,nuls,recrutement
Eivro,3,1,0,0
ADB_Samyfit,3,1,0,0
```

- `victoires` / `defaites` / `nuls` = score des matchs (W-L-D)
- `recrutement` = (héritage, non utilisé — voir `recrutement.csv` ci-dessous)

Pour générer un CSV depuis un copié-collé melee.gg :

```bash
python parse_melee.py resultats.txt -o data/set-7/boutique/etape_02.csv
```

### Recrutement

Les paires recrue → recruteur sont stockées dans `data/<set>/<boutique>/recrutement.csv` :

```csv
recrue,recruteur
TheHolyBob,ADB_RemiWanKenobi
le_Schtroumpf,Ecto
```

Le recruteur reçoit **+5 pts** dès que sa recrue dépasse **15 points cumulés** (seuil `SEUIL_RECRUTEMENT`), une seule fois par recrue.

### Alias de joueurs

Quand un joueur change son pseudo melee.gg, on normalise toutes ses occurrences. Sur le site : **Gestion → Alias de joueurs**. Pour les outils Python (CSV) : `PLAYER_ALIASES` dans `data.py` :

```python
PLAYER_ALIASES = {
    "Dracos": "ADB_Dracos",
    "Eivro":  "ADB_Eivro",
}
```

### Jeu libre (étape forfait)

Une étape amicale (sans enjeu de classement interne) peut être marquée en ajoutant `# forfait` en première ligne du CSV :

```csv
# forfait
joueur,victoires,defaites,nuls,recrutement
Darkus,3,0,0,0
...
```

Chaque participant reçoit alors **11 pts forfaitaires** (le maximum). Le panneau d'étape masque les colonnes V/D/N et affiche un pied *"Jeu libre — 11 pts forfait pour chaque participant"*.

## Barème

| Catégorie     | Points                                         |
|---------------|------------------------------------------------|
| Participation | +2 pts (min. 1 partie jouée)                   |
| Victoires     | +2 pts/victoire (max 6)                        |
| Parties       | +1 pt/partie (max 3)                           |
| Recrutement   | +5 pts/recrue (quand la recrue atteint 15 pts) |
| Jeu libre     | 11 pts forfaitaires pour chaque participant    |

## Ajouter une boutique ou un set

Sur le site en ligne : page **Gestion** (administrateur). Dans l'application Flask locale, même page **Gestion** :

- **Nouveau set** : nom (ex. « Set 8 ») et identifiant facultatif (déduit du nom : `set-8`). Cochez « Définir comme set en cours » pour que l'accueil, l'import et la génération d'images basculent dessus. Chaque boutique y démarre une ligue vide (étapes et recrutement repartent de zéro) ; les sets précédents restent consultables.
- **Nouvelle boutique** : nom et identifiant facultatif. Elle apparaît aussitôt dans tous les sets.
- Les noms affichés peuvent être modifiés ; les identifiants, utilisés dans les liens et les dossiers, sont fixes.

La configuration est stockée dans `data/leagues.json` (à commiter avec le reste de `data/`) :

```json
{
  "current_set": "set-7",
  "sets": { "set-7": "Set 7" },
  "shops": { "all4play": "All4Play" }
}
```

## CI/CD

Un workflow GitHub Actions génère automatiquement les images et crée une release à chaque push modifiant `data/`. Il peut aussi être déclenché manuellement. Les assets sont nommés `<set>_<boutique>_etape_NN.webp`. Il ne travaille que sur les CSV du set en cours : il ne reflète donc pas les étapes importées sur le site (qui génère ses propres images).

## Historique du projet

### Point de départ

Un script Python (`image.py`, `drawing.py`, `data.py`) produisait une image de classement par étape à partir de CSV remplis à la main depuis des copiés-collés melee.gg.

### Étapes de la refonte (octobre 2026)

1. **Application Flask** sur les mêmes CSV : import par lien melee.gg, classement par boutique, recrutement, téléchargement des images.
2. **Import melee.gg automatique** : la page publique d'un tournoi appelle l'endpoint JSON `/Standing/GetRoundStandings` (sans authentification, paramètres DataTables). On lit la dernière ronde terminée ; un en-tête `User-Agent` de navigateur est nécessaire (sinon 403).
3. **Classement animé** : curseur d'étape continu qui interpole rangs et totaux entre deux étapes puis se cale sur la plus proche au relâchement, avec un effet de vague du haut vers le bas, lecture de la saison, suivi d'un joueur. Le style reprend celui des images (Ayu Dark, JetBrains Mono, angles droits).
4. **Sets et boutiques gérés depuis l'application** (`data/leagues.json`) plutôt que dans le code.
5. **Hébergement sur Cloudflare**, sans délai entre une modification et son affichage : Worker + D1, connexion Discord, droits par boutique.

### Choix techniques

- **Cloudflare Workers + D1 plutôt que GitHub Pages + CI** : une version statique reconstruite à chaque modification aurait imposé une à deux minutes de délai, et les hébergeurs Python gratuits perdent leur disque au redémarrage ou s'endorment. Avec D1, chaque écriture est visible à la page suivante.
- **Portage du barème en TypeScript** : Flask ne tourne pas sur les Workers. Pour éviter toute dérive entre les deux implémentations, `worker/test/parity.test.ts` compare le portage aux vues calculées par l'app Python sur les vraies données (`npm run fixtures` puis `npm test` dans `worker/` après toute modification du barème Python).
- **Images dessinées dans le navigateur** : Pillow n'est pas disponible sur les Workers ; `worker/public/static/capture.js` reprend `drawing.py` sur `<canvas>` (mêmes dimensions, couleurs et polices).
- **Connexion Discord** : les joueurs et organisateurs ont déjà un compte, aucun mot de passe à gérer. Seul le champ `identify` (pseudo, avatar) est demandé.
- **Sécurité** : sessions en base (cookie `HttpOnly`, `Secure`, `SameSite=Lax`), formulaires refusés si l'en-tête `Origin` ne correspond pas au site, connexion de test (`DEV_LOGIN`) active uniquement en local.

### Bugs notables corrigés

- **Saccade du classement entre les étapes 5 et 6 (Cercle du Jeu)** : à mi-chemin, le texte d'une carte de statistiques passait sur deux lignes et décalait tout le tableau de 18 px. Les sous-titres des cartes tiennent désormais sur une ligne.
- **Page « accès refusé » en erreur 500** : avec du JSX, `c.html()` de Hono renvoie une promesse ; les gardes de droits la confondaient avec des paramètres valides.

### Mise en ligne : points d'attention

- Créer l'application Discord déclenche un CAPTCHA, à résoudre soi-même.
- `invalid_client` dans les journaux (`npx wrangler tail`) à la connexion = mauvais secret Discord : copier la **clé secrète du client** (page OAuth2, après « Réinitialiser la clé secrète »), pas la « clé publique » de la page Informations générales.
- Le premier compte connecté est « en attente » tant que `OWNER_DISCORD_ID` n'est pas renseigné ; il a été promu propriétaire puis fixé dans `wrangler.jsonc`.
- L'import melee.gg fonctionne depuis le réseau Cloudflare (vérifié en production).

## Structure

```
worker/          # Site en ligne : Worker Cloudflare + D1 (voir worker/README.md)
data.py          # Modèle de données, I/O CSV, scoring, ranking
theme.py         # Palette couleurs, fonts, constantes layout
drawing.py       # Rendu PIL (panels, barème, disclaimer, composition)
image.py         # Point d'entrée CLI
app.py           # Application web Flask
melee.py         # Récupération d'un classement depuis un lien melee.gg
templates/       # Pages HTML (Jinja2)
static/          # Feuille de style
parse_melee.py   # Parser copié-collé melee.gg → CSV
fonts/           # Polices JetBrains Mono (OFL)
data/            # leagues.json (sets, boutiques, set en cours) + CSV par set et boutique
```
