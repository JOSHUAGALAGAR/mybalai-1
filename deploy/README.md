# Deploying MyBalai (web)

Production: https://mybalai.delxtdev.cloud — a CloudPanel Node.js site (nginx → app port **3004**),
run by PM2 as `mybalai` (`ecosystem.config.cjs`).

## Automatic deploy (GitHub Actions)

Every push to `main` runs `.github/workflows/deploy.yml`: typecheck, lint and tests, then a build on
GitHub's runner, then `deploy/deploy.sh` uploads it and reloads PM2. Repository secrets it needs:
`PRODUCTION_ENV` (the whole `.env.production` file), `SSH_HOST`, `SSH_USER`, `SSH_PASSWORD`,
`SSH_KNOWN_HOSTS`; and the variable `DEPLOY_DIR` (the site folder on the server). To deploy without
pushing: Actions → *Deploy to production* → *Run workflow*.

## Manual deploy

1. Commit and push (`git push origin main`).
2. `cp deploy/env.production.example deploy/.env.production` and fill it in (once).
3. `SSHPASS='…' deploy/deploy.sh` (or use an SSH key and drop `SSHPASS`).

The script uploads `HEAD`, builds on the server, switches the `current` link, reloads PM2 and checks
`/login`. `deploy/deploy.sh rollback` returns to the previous release.

## One-time setup outside this repo

- **Supabase → Authentication → URL configuration:** Site URL `https://mybalai.delxtdev.cloud`;
  add `https://mybalai.delxtdev.cloud/**` to the redirect URLs (and the same in Google Cloud's OAuth
  client if Google sign-in is used).
- **PayMongo → Webhooks:** create one for `https://mybalai.delxtdev.cloud/api/paymongo/webhook`
  and put its secret in `PAYMONGO_WEBHOOK_SECRET`.
- **Database:** every migration in `supabase/migrations` applied, in order (latest: `0024`).
- **Restart after a server reboot:** ask the server admin to run `pm2 startup` once as root
  (`pm2 resurrect` then brings the app back).
