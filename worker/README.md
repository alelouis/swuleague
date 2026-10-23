# swuleague — site Cloudflare

Site des ligues SWU hébergé entièrement sur Cloudflare (offre gratuite) :

- **Worker** (TypeScript, [Hono](https://hono.dev)) : pages, import melee.gg, espace organisateurs.
- **D1** (SQLite) : sets, boutiques, étapes, résultats, recrutement, alias, comptes.
- **Assets statiques** : CSS, JS (classement animé, génération d'image), polices.

Chaque modification est visible immédiatement : pas de build ni de délai.

## Rôles

| Rôle | Droits |
|---|---|
| Visiteur (joueurs) | Consulter les classements, télécharger les images. Aucun compte. |
| En attente | S'est connecté avec Discord ; attend la validation. |
| Organisateur | Importer / supprimer des étapes et gérer le recrutement **de ses boutiques**. |
| Administrateur | Tout : sets, boutiques, alias, comptes (page **Gestion**). |

Le compte Discord défini par `OWNER_DISCORD_ID` est toujours administrateur.
Un organisateur se connecte une fois via « Organisateurs » → Discord, puis apparaît dans **Gestion → Organisateurs** où l'administrateur choisit son rôle et ses boutiques.

## Mise en ligne (une fois)

Prérequis : un compte Cloudflare gratuit, Node.js, et `uv` pour la migration des CSV.

```bash
cd worker
npm install
npx wrangler login
```

1. **Base de données**

   ```bash
   npx wrangler d1 create swuleague
   ```

   Copier le `database_id` affiché dans `wrangler.jsonc`, puis :

   ```bash
   npm run db:migrate:remote
   npm run db:seed:sql
   npx wrangler d1 execute swuleague --remote --file seed.sql
   ```

   `seed.sql` reprend `data/leagues.json`, tous les CSV d'étapes, le recrutement et les alias. À n'exécuter **qu'une fois** : il remplace les données des ligues en ligne.

2. **Application Discord** sur <https://discord.com/developers/applications> → *New Application* → *OAuth2* :
   - copier le **Client ID** dans `DISCORD_CLIENT_ID` (`wrangler.jsonc`) ;
   - générer le **Client Secret** puis `npx wrangler secret put DISCORD_CLIENT_SECRET` ;
   - ajouter la redirection `https://swuleague.<votre-sous-domaine>.workers.dev/auth/callback` (et celle du domaine personnalisé si vous en ajoutez un).

3. **Propriétaire** : dans Discord, *Paramètres → Avancés → Mode développeur*, puis clic droit sur votre profil → *Copier l'identifiant*. Le mettre dans `OWNER_DISCORD_ID` (`wrangler.jsonc`).

4. **Déployer**

   ```bash
   npm run deploy
   ```

   Le site est en ligne sur `https://swuleague.<votre-sous-domaine>.workers.dev`. Un domaine personnalisé s'ajoute dans le tableau de bord Cloudflare (*Workers → swuleague → Settings → Domains*).

## Développement local

```bash
cp .dev.vars.example .dev.vars          # DEV_LOGIN=1 : connexion sans Discord en local
npm run db:migrate:local
npm run db:seed:sql && npx wrangler d1 execute swuleague --local --file seed.sql
npm run dev                              # http://localhost:8787
```

Sur `/login`, des liens de développement permettent de se connecter comme administrateur, organisateur All4Play ou compte en attente. Ils ne fonctionnent qu'en `localhost` avec `DEV_LOGIN=1`.

```bash
npm test          # parité du barème TypeScript avec l'app Python (test/fixtures.json)
npm run typecheck
npm run fixtures  # régénère test/fixtures.json depuis les CSV
```

## Sauvegardes

```bash
npx wrangler d1 export swuleague --remote --output sauvegarde.sql
```

D1 propose aussi *Time Travel* (restauration à un instant récent) : `npx wrangler d1 time-travel --help`.

## Limites de l'offre gratuite

Largement suffisantes pour des ligues locales : 100 000 requêtes Worker par jour, et pour D1 5 Go de stockage, 5 millions de lignes lues et 100 000 lignes écrites par jour (une page de ligue lit quelques centaines de lignes).

## Structure

```
src/index.tsx   routes, droits, import
src/views.tsx   pages HTML (JSX côté serveur)
src/scoring.ts  barème et classements (portage de data.py)
src/melee.ts    récupération melee.gg + parseur de copié-collé
src/auth.ts     connexion Discord, sessions, rôles
src/db.ts       requêtes D1
public/static/  style.css, league.js (classement animé), capture.js (image)
migrations/     schéma D1
scripts/        migration CSV → D1
```
