# swuleague

Générateur d'images de classement pour ligues [Star Wars Unlimited](https://www.starwarsunlimited.com/).

Produit des images WebP combinant classement général et résultats par étape, prêtes à être partagées sur Discord. Les images sont organisées par set et par boutique.

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

Le site public et l'espace organisateurs (connexion Discord, droits par boutique) tournent sur Cloudflare Workers + D1, gratuitement : voir [`worker/README.md`](worker/README.md) pour la mise en ligne. La base D1 devient alors la source des données ; les CSV de `data/` servent à la migration initiale.

## Application web (version locale Flask)

Une application Flask permet de suivre les ligues semaine après semaine : classements par boutique (avec évolution ▲▼ et navigation par étape), import d'une étape depuis un lien melee.gg, gestion du recrutement et téléchargement de l'image WebP de chaque étape.

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

Quand un joueur change son pseudo melee.gg, on normalise toutes ses occurrences via `PLAYER_ALIASES` dans `data.py` :

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

Depuis l'application web, page **Gestion** (lien dans la barre du haut) :

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

Un workflow GitHub Actions génère automatiquement les images et crée une release à chaque push modifiant `data/`. Il peut aussi être déclenché manuellement. Les assets sont nommés `<set>_<boutique>_etape_NN.webp`.

## Structure

```
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
