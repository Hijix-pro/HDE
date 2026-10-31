# HDE-Inventaire — inventaire partagé

MVP web pour suivre un inventaire commun : recherche, catégories, emplacements, seuils d’alerte, édition et suppression. Stack : Next.js (App Router), React, TypeScript, Tailwind CSS, Supabase Auth + Postgres + RLS + Realtime, GitHub et Vercel.

## Démarrer en local

1. Installez Node.js 20.9 ou plus récent et Git. Node 24 convient.
2. Ouvrez ce dossier dans Codex, puis dans le terminal exécutez :

   ```sh
   npm install
   cp .env.example .env.local
   npm run dev
   ```

3. Ouvrez `http://localhost:3000`. Sans identifiants Supabase, l’interface tourne en mode aperçu avec quelques exemples. Ces données ne sont conservées que dans la session du navigateur.

## Créer le backend Supabase

1. Créez un compte sur [Supabase](https://supabase.com/) puis un nouveau projet. Choisissez une région proche de vos utilisateurs.
2. Dans **SQL Editor**, collez le contenu de [`supabase/schema.sql`](supabase/schema.sql), puis exécutez-le. Cela crée la table et les règles RLS.
   Si la base existe déjà, exécutez aussi [`supabase/update-inventory-categories.sql`](supabase/update-inventory-categories.sql) pour harmoniser les anciennes catégories.
3. Pour retrouver les valeurs de connexion :
   - Cliquez sur **Connect** en haut du tableau de bord Supabase.
   - Gardez **Framework → Next.js** sélectionné.
   - Dans le bloc `.env.local`, repérez `NEXT_PUBLIC_SUPABASE_URL=` et copiez la valeur qui suit. C’est l’URL du projet, de la forme `https://…supabase.co`.
   - Pour la clé, ouvrez **Project Settings → API Keys** et copiez la **Publishable key** (`sb_publishable_…`). Vous pouvez aussi copier la valeur `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` affichée dans **Connect**.
4. Dans `.env.local`, remplacez les exemples :

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://....supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

5. Enregistrez `.env.local`, arrêtez le serveur local s’il tourne déjà avec `Ctrl+C`, puis relancez `npm run dev`. Ouvrez `http://localhost:3000`, créez un compte depuis l’écran de connexion, puis connectez-vous. Selon le réglage Supabase, il faudra confirmer l’adresse email.
6. Pour tester le partage, créez un deuxième compte dans un autre navigateur. Les deux comptes voient le même inventaire; les changements se synchronisent par Realtime.

### Accès et clés

La clé Publishable est prévue pour une application web. La sécurité des données dépend des règles RLS du fichier SQL. **Ne mettez jamais une clé Secret ou `service_role` dans `NEXT_PUBLIC_*` ou dans Git.** Le schéma fourni donne accès au même inventaire à tous les comptes authentifiés. Avant un usage public ou multi-organisation, il faudra ajouter des espaces de travail et des membres, puis limiter chaque règle RLS à l’espace de l’utilisateur.

## Mettre le code sur GitHub

1. Créez un dépôt GitHub (privé recommandé si le projet contient des informations métier).
2. Depuis le terminal du dossier, initialisez et poussez le projet :

   ```sh
   git init
   git add .
   git commit -m "Initialise l’application Stocke"
   git branch -M main
   git remote add origin https://github.com/VOTRE-COMPTE/VOTRE-DEPOT.git
   git push -u origin main
   ```

3. Vérifiez que `.env.local` n’apparaît pas dans les fichiers envoyés. Il est exclu par `.gitignore`.

## Déployer sur Vercel

1. Créez un compte Vercel, faites **Add New → Project**, connectez GitHub et importez le dépôt.
2. Vercel détecte Next.js. Gardez la commande de build par défaut (`next build`).
3. Dans les variables d’environnement du projet, ajoutez `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` pour **Production**, **Preview** et **Development**. N’ajoutez pas la clé Secret.
4. Lancez le déploiement. Chaque push sur `main` publiera une nouvelle version; les branches de travail produiront un aperçu.
5. Dans Supabase, ouvrez **Authentication → URL Configuration** et ajoutez le domaine Vercel à **Site URL** et aux URLs de redirection autorisées.
6. Après toute modification des variables Vercel, redéployez. Sur l’URL publiée, testez inscription, lecture, ajout, modification, suppression et partage avec un deuxième compte.

## Checklist avant partage du lien

- [ ] Le script `supabase/schema.sql` a été appliqué au bon projet.
- [ ] L’inscription et la confirmation email fonctionnent.
- [ ] Les deux variables Supabase sont présentes dans les trois environnements Vercel.
- [ ] Aucune clé Secret/service role n’est dans le dépôt ou le navigateur.
- [ ] RLS est activé; seuls les utilisateurs authentifiés ont accès.
- [ ] Un article ajouté par un compte apparaît sur l’autre appareil.
- [ ] Le lien Vercel ouvre l’application sur mobile et ordinateur.
- [ ] Les données de démonstration ont été remplacées par les données réelles.

## Étapes possibles ensuite

1. Espaces de travail et invitations avec des droits par équipe.
2. Historique de mouvements et journal des modifications.
3. Import/export CSV et lecture de codes-barres.
4. Rôles administrateur/membre et alertes email.

Pour modifier avec Codex, demandez par exemple : « Ajoute un historique des mouvements de stock, avec une table Supabase, les règles RLS et l’affichage dans l’application. »
# HDE
# HDE
