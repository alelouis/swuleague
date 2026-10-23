# CLAUDE.md

## Parsing des résultats melee.gg

Pour parser des résultats copiés-collés depuis melee.gg, utiliser le script `parse_melee.py` :

1. Sauvegarder le copié-collé dans un fichier temporaire
2. Lancer : `python3 parse_melee.py <input.txt> -o <output.csv>`

Le script gère le retrait des pronoms et produit un CSV au format `joueur,victoires,defaites,nuls,recrutement`.

## Import depuis un lien melee.gg

`melee.fetch_tournament(<url>)` récupère le classement de la dernière ronde terminée (endpoint JSON `/Standing/GetRoundStandings`, sans authentification). L'application web (`uv run flask --app app run`) l'utilise pour l'import d'étape.

## Site Cloudflare (worker/)

Le site en ligne est un Worker TypeScript + D1 dans `worker/` (voir `worker/README.md`). Le barème est porté dans `worker/src/scoring.ts` : après toute modification du barème Python (`data.py`), régénérer `npm run fixtures` puis `npm test` dans `worker/` pour garder les deux implémentations identiques.
