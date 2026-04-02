# swuleague

Générateur d'images de classement pour ligues [Star Wars Unlimited](https://www.starwarsunlimited.com/).

Produit des images PNG/WebP combinant classement général et résultats par étape, prêtes à être partagées sur Discord. Les images sont organisées par set et par boutique.

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
- `recrutement` = nombre de nouvelles recrues amenées par ce joueur à cette étape

Pour générer un CSV depuis un copié-collé melee.gg :

```bash
python parse_melee.py resultats.txt -o data/set-7/boutique/etape_02.csv
```

## Barème

| Catégorie     | Points                       |
|---------------|------------------------------|
| Participation | +2 pts (min. 1 partie jouée) |
| Victoires     | +2 pts/victoire (max 6)      |
| Parties       | +1 pt/partie (max 3)         |
| Recrutement   | +5 pts/recrue                |

## Ajouter une boutique

Ajouter une entrée dans `SHOPS` de `data.py`, puis créer le dossier `data/<set>/<slug>/` avec les CSV d'étapes.

## Ajouter un set

Ajouter une entrée dans `SETS` de `data.py` et mettre à jour `CURRENT_SET`. Créer les dossiers `data/<nouveau-set>/<boutique>/`.

## CI/CD

Un workflow GitHub Actions génère automatiquement les images et crée une release à chaque push modifiant `data/`. Il peut aussi être déclenché manuellement. Les assets sont nommés `<set>_<boutique>_etape_NN.png`.

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
