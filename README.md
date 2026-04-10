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

## Ajouter une boutique

Ajouter une entrée dans `SHOPS` de `data.py`, puis créer le dossier `data/<set>/<slug>/` avec les CSV d'étapes.

## Ajouter un set

Ajouter une entrée dans `SETS` de `data.py` et mettre à jour `CURRENT_SET`. Créer les dossiers `data/<nouveau-set>/<boutique>/`.

## CI/CD

Un workflow GitHub Actions génère automatiquement les images et crée une release à chaque push modifiant `data/`. Il peut aussi être déclenché manuellement. Les assets sont nommés `<set>_<boutique>_etape_NN.webp`.

## Structure

```
data.py          # Modèle de données, I/O CSV, scoring, ranking
theme.py         # Palette couleurs, fonts, constantes layout
drawing.py       # Rendu PIL (panels, barème, disclaimer, composition)
image.py         # Point d'entrée CLI
parse_melee.py   # Parser copié-collé melee.gg → CSV
fonts/           # Polices JetBrains Mono (OFL)
data/            # Fichiers CSV par set et boutique
```
