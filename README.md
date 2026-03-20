# swuleague

Générateur d'images de classement pour ligues [Star Wars Unlimited](https://www.starwarsunlimited.com/).

Produit des images PNG/WebP combinant classement général et résultats par étape, prêtes à être partagées sur Discord.

## Installation

```bash
pip install .
```

## Utilisation

```bash
# Générer les images pour toutes les boutiques
python image.py

# Générer pour une boutique spécifique
python image.py -b all4play
```

## Données

Les résultats sont stockés en CSV dans `data/<boutique>/etape_NN.csv` :

```csv
joueur,victoires,defaites,recrutement
CrYad,3,0,0
Alelouis,2,1,1
```

- `recrutement` = nombre de nouvelles recrues amenées par ce joueur à cette étape

## Barème

| Catégorie     | Points                       |
|---------------|------------------------------|
| Participation | +2 pts (min. 1 partie jouée) |
| Victoires     | +2 pts/victoire (max 6)      |
| Parties       | +1 pt/partie (max 3)         |
| Recrutement   | +5 pts/recrue                |

## Ajouter une boutique

Ajouter une entrée dans le dictionnaire `SHOPS` de `data.py`, puis créer le dossier `data/<slug>/` avec les CSV d'étapes.

## Structure

```
data.py      # Modèle de données, I/O CSV, scoring, ranking
theme.py     # Palette couleurs, fonts, constantes layout
drawing.py   # Rendu PIL (panels, barème, composition)
image.py     # Point d'entrée CLI
fonts/       # Polices TX-02 embarquées
data/        # Fichiers CSV par boutique
```
