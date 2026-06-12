# Get Environment Variables

A GitHub Action that **fetches repository or deployment-environment variables**
and injects them into your job as **environment variables**, **step outputs**,
or **both** — *without* binding the job to a deployment environment (no
`environment:` key, no deployment record).

Built on the **`node24`** action runtime to stay current with GitHub's runner
updates.

> Inspired by [`raven-actions/environment-variables`](https://github.com/raven-actions/environment-variables),
> rebuilt on the latest Node runtime with glob filtering, name transforms and
> aggregate outputs.

## Why

GitHub only exposes [Deployment Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
variables to a job when that job declares `environment: <name>` — which creates
a deployment and runs protection rules. Sometimes you just want the *values*
(e.g. a non-deployment build step, a matrix, a reusable workflow) without that
ceremony. This action reads the variables over the REST API and injects them
directly.

It also works for plain **repository-level** Actions variables (leave
`environment` empty).

## Usage

```yaml
- name: Load staging variables
  id: vars
  uses: inspira-legal/get-env-action@v1
  with:
    github-token: ${{ secrets.VARS_TOKEN }}   # see "Token" below
    environment: staging                        # omit for repo-level variables

- name: Use them
  run: |
    echo "From env:    $API_URL"                # injected into the job env
    echo "From output: ${{ steps.vars.outputs.API_URL }}"
    echo "All names:   ${{ steps.vars.outputs.names }}"
    echo "Count:       ${{ steps.vars.outputs.count }}"
```

### Only as step outputs (don't touch the job env)

```yaml
- uses: inspira-legal/get-env-action@v1
  id: vars
  with:
    github-token: ${{ secrets.VARS_TOKEN }}
    environment: production
    output-to: output
```

### Filter, prefix, and namespace per environment

```yaml
- uses: inspira-legal/get-env-action@v1
  with:
    github-token: ${{ secrets.VARS_TOKEN }}
    environment: staging
    include: "AWS_*, FEATURE_*"     # globs: * and ?
    exclude: "*_SECRET"             # exclude always wins
    prefix: "STG_"                  # AWS_REGION -> STG_AWS_REGION
    name-case: upper
```

### From another repository

```yaml
- uses: inspira-legal/get-env-action@v1
  with:
    github-token: ${{ secrets.CROSS_REPO_TOKEN }}
    repository: my-org/shared-config
    environment: shared
```

### With a GitHub App installation token (recommended)

A GitHub App token avoids long-lived PATs and scopes cleanly to the repos the
App is installed on. Generate it in a prior step and pass it as `github-token`:

```yaml
permissions:
  contents: read

steps:
  - name: Generate token
    id: generate_token
    uses: actions/create-github-app-token@v3
    with:
      client-id: ${{ secrets.ENV_READER_ID }}
      private-key: ${{ secrets.ENV_READER_KEY }}
      # owner: inspira-legal            # set when reading from another repo/org
      # repositories: shared-config

  - name: Load environment variables
    id: vars
    uses: inspira-legal/get-env-action@v1
    with:
      github-token: ${{ steps.generate_token.outputs.token }}
      environment: staging
```

Grant the App **Variables: read** (and **Environments: read** for
environment-scoped variables) on the target repositories.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github-token` | yes | `${{ github.token }}` | Token with read access to variables. **The default `GITHUB_TOKEN` usually cannot read variables** — see [Token](#token). |
| `environment` | no | `''` | Deployment environment name. Empty = repository-level variables. |
| `repository` | no | `${{ github.repository }}` | Target repo in `owner/repo` form. |
| `output-to` | no | `all` | Where to inject: `env`, `output`, or `all`. |
| `prefix` | no | `''` | Prepended to every injected name (e.g. `STG_`). |
| `name-case` | no | `none` | Case transform for injected names: `none`, `upper`, `lower`. |
| `include` | no | `''` | Comma/newline glob patterns (`*`, `?`) to include. Empty = all. |
| `exclude` | no | `''` | Comma/newline glob patterns to exclude. Exclude wins over include. |
| `overwrite` | no | `true` | When injecting env vars, overwrite names already set in the job env. |
| `dry-run` | no | `false` | Log what *would* be injected without setting anything. |
| `fail-on-empty` | no | `false` | Fail if no variables match after filtering. |

## Outputs

In addition to one output **per variable** (`steps.<id>.outputs.<NAME>`, after
prefix/case), the action sets:

| Output | Description |
|--------|-------------|
| `variables` | JSON object mapping every injected name to its value. |
| `names` | Comma-separated list of injected names. |
| `count` | Number of variables injected. |

## Token

Reading repository/environment **variables** over the API requires more than
the default `GITHUB_TOKEN` provides. Use a **fine-grained PAT** or a **GitHub
App installation token** with:

- **Variables** → **Read-only** (required), and
- **Environments** → **Read-only** (when reading environment-scoped variables).

Store it as a secret and pass it via `github-token`. If the token is
insufficient the action fails with an explicit `401/403/404` message.

For the App-token approach, see
[With a GitHub App installation token](#with-a-github-app-installation-token-recommended)
above — it uses [`actions/create-github-app-token`](https://github.com/actions/create-github-app-token)
to mint a short-lived token at runtime.

> Variables are **not** secrets — they are returned in plaintext and may appear
> in logs/outputs. Do not use this action to read secrets.

## How it works

1. Resolves `owner/repo` and the optional `environment`.
2. Paginates the REST endpoint
   (`/repos/{owner}/{repo}/environments/{env}/variables` or
   `/repos/{owner}/{repo}/actions/variables`) collecting every page.
3. Applies `include`/`exclude` globs, then `prefix` + `name-case`.
4. Writes env vars to `$GITHUB_ENV`, outputs to `$GITHUB_OUTPUT`, and a job
   summary — or just logs them under `dry-run`.

## Development

```bash
npm ci
npm run lint     # tsc --noEmit (type-check)
npm test         # vitest
npm run build    # bundle to dist/index.js via @vercel/ncc
npm run all      # lint + test + build
```

The bundled `dist/` is committed (GitHub runs `dist/index.js` directly). CI
fails if `dist/` is stale relative to `src/`, so run `npm run build` and commit
before pushing.

## Releasing

Releases are fully automated with
[**semantic-release**](https://github.com/semantic-release/semantic-release).
Every push to `main` runs the **Release** workflow, which:

1. Runs the CI gate — type-check, tests, build, and a stale-`dist/` check.
   **Nothing is published unless all of these pass.**
2. Analyzes commits since the last release ([Conventional
   Commits](https://www.conventionalcommits.org/)) to compute the next version.
3. Updates `CHANGELOG.md` + `package.json`, commits them back to `main`, and
   tags the release (`vX.Y.Z`).
4. Creates the GitHub Release with generated notes.
5. Force-updates the floating **major** tag (e.g. `v1`) to the new release so
   consumers can pin `uses: inspira-legal/get-env-action@v1`.

Commit message conventions drive the version bump:

| Commit type | Release |
|-------------|---------|
| `fix: …` | patch (`v1.0.x`) |
| `feat: …` | minor (`v1.x.0`) |
| `feat!: …` / `BREAKING CHANGE:` in body | major (`vx.0.0`) |
| `docs:` / `chore:` / `refactor:` / `test:` | no release |

No secrets beyond the built-in `GITHUB_TOKEN` are required. If `main` has branch
protection that blocks direct pushes, grant the release a token/App that is
allowed to push (semantic-release commits the changelog + version back to
`main`).

## License

[MIT](./LICENSE)
