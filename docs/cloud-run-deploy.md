# Cloud Run Deployment Checklist

1. **Provision Postgres**: create or identify the Cloud SQL (PostgreSQL) instance and database. Collect the connection string in SQLAlchemy form `postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME`. If you use a socket/Cloud SQL proxy, adapt the URL accordingly.
2. **Store secrets**: add the connection string to Cloud Build / GitHub Actions secrets (`_DATABASE_URL` substitution or `CLOUDRUN_DATABASE_URL` GitHub secret). Keep `SESSION_SECRET`, Stripe keys, etc. in Secret Manager or GH secrets as you prefer.
3. **Deploy with env vars**:
   ```bash
   gcloud run deploy podcast-web \
     --image=<region>-docker.pkg.dev/<project>/cloud-run/podcast-web:latest \
     --region=us-west1 \
     --platform=managed \
     --allow-unauthenticated \
     --set-env-vars=APP_ENV=production,ADMIN_EMAIL=scott@scottgerhardt.com,MEDIA_ROOT=/tmp \
     --set-secrets=DATABASE_URL=<secret-name>:latest
   ```
   Replace `<secret-name>` with the Secret Manager entry that holds your Postgres URL. If you prefer direct set, swap `--set-secrets` for `--set-env-vars=...DATABASE_URL=<url>`.
4. **Verify runtime**: after deploy, hit `/api/users/me`, run `scripts/login_and_me.py`, try an RSS import, and upload a media file to confirm the Postgres-backed instance handles reads/writes.
5. **First-time DB bootstrap**: the API auto-creates tables on startup. If you need to backfill admin data, run `scripts/create_test_user.py` against the new API or add manual entries through psql.

Keep `MEDIA_ROOT=/tmp` so FastAPI writes uploads into Cloud Run's writable space. If you later mount a Cloud Storage FUSE bucket, update `MEDIA_ROOT` to that mount point.
