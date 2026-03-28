# CLAUDE.md

## Parsing des résultats melee.gg

Pour parser des résultats copiés-collés depuis melee.gg, utiliser le script `parse_melee.py` :

1. Sauvegarder le copié-collé dans un fichier temporaire
2. Lancer : `python3 parse_melee.py <input.txt> -o <output.csv>`

Le script gère le retrait des pronoms et produit un CSV au format `joueur,victoires,defaites,nuls,recrutement`.
