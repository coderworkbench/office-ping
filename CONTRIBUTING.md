# Contributing to Office Ping

Thanks for helping out. This guide gets you from a fresh clone to an opened
pull request. If anything here is wrong or unclear, that is a bug too: please
open an issue.

## 1. Fork and clone

```bash
# On GitHub: click "Fork", then
git clone https://github.com/<your-username>/office-ping.git
cd office-ping
git remote add upstream https://github.com/coderworkbench/office-ping.git
```

## 2. Run it locally

Everything runs in Docker, so you only need Docker Engine 24+ with the Compose
plugin (and Node.js 20 if you want to run the frontend checks outside Docker).

```bash
cp .env.example .env     # the defaults are fine for local development
make setup               # builds the images
make dev                 # starts Postgres, Redis, backend, escalator, frontend, nginx
make seed                # demo users, groups and templates (dev only)
```

Open <http://localhost:8080>. `make seed` prints the demo password.

Other useful targets (see the `Makefile`):

| Command | What it does |
|---|---|
| `make logs` | Follow the logs of every container |
| `make shell` | Django shell inside the backend container |
| `make migrate` / `make makemigrations` | Apply / generate database migrations |
| `make down` | Stop everything |
| `scripts/reset-db.sh` | Wipe the database and re-seed (asks first) |

The backend image copies the source at build time, so after changing Python
code run `docker compose up -d --build backend escalator` (or `make setup && make dev`).

## 3. Make a branch

Branch from an up-to-date `main`:

```bash
git fetch upstream
git checkout -b feature/short-description upstream/main
```

Suggested prefixes: `feature/`, `fix/`, `docs/`, `chore/`. Keep one topic per
branch; small pull requests are reviewed faster.

## 4. Tests

Backend tests use pytest and run inside the backend container against the
Postgres and Redis services:

```bash
make test                                   # the whole suite
docker compose exec backend pytest tests/test_pings.py -q   # one file
docker compose exec backend pytest -k reaction               # by name
```

There is no frontend unit-test suite yet. The `test:e2e` script in
`frontend/package.json` expects Playwright, but no Playwright configuration or
scenarios are committed; contributions here are welcome.

**Every change to backend behaviour should come with a test** in
`backend/tests/`. Look at the existing files for the fixtures (`auth`,
`admin_user`, `member_a`, …) defined in `backend/tests/conftest.py`.

If you change a Django model, generate and commit the migration
(`make makemigrations`). The test suite fails if a model and its migrations
disagree.

## 5. Lint and type checks

```bash
make lint                                   # backend compile check + frontend ESLint
cd frontend && npm install && npm run lint  # frontend ESLint on its own
cd frontend && npm run typecheck            # TypeScript
```

The backend has no formatter configured; follow the style of the surrounding
code (4-space indent, double quotes, `snake_case`). The frontend uses the
Next.js ESLint rules in `frontend/.eslintrc.json`; keep the code warning-free
where you can. CI runs all of these on every pull request.

## 6. Documentation

- User-facing text lives in `frontend/content/manual.json` (the in-app Help)
  and `frontend/content/releases.json` (What's new). After editing either,
  run `make manual` to regenerate `docs/user-manual.md` and `CHANGELOG.md`.
  Do not edit those two generated files by hand.
- Developer and operator docs live in `docs/`. Keep them short and keep the
  commands copy-pasteable.
- New configuration variables go in `.env.example` with a one-line comment,
  and in the README's configuration table.

## 7. Commits and pull requests

- Write commit messages in the imperative mood ("Add a mute button", not
  "Added"). The first line should make sense on its own.
- Before opening a pull request, make sure `make test` and `make lint` pass.
- Fill in the pull request template: what changed, why, and how you tested it.
  Include screenshots for UI changes.
- A maintainer reviews every pull request. Please respond to review comments
  and push follow-up commits to the same branch; we squash on merge.
- If your change is user-visible, add an entry to
  `frontend/content/releases.json` under a new version (semantic versioning)
  and run `make manual`. Maintainers can also do this at release time; say so
  in the pull request if you would rather leave it to them.

## 8. Reporting bugs and suggesting features

Use the issue templates. For bugs, include the version (Help → What's new in
the app, or `frontend/package.json`), browser and steps to reproduce. For
anything security-related, follow [SECURITY.md](SECURITY.md) instead of
opening a public issue.

## 9. Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By
participating you agree to its terms.
