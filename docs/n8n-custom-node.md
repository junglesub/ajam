# n8n Custom Node

## Package

The custom node package lives at `packages/n8n-nodes-ajam` and publishes to GitHub Packages as `@junglesub/n8n-nodes-ajam`.

It follows n8n's community node package shape:

- `credentials/AjamApi.credentials.ts`: stores aJam base URL and internal API token.
- `nodes/Ajam/Ajam.node.ts`: exposes aJam actions.
- `nodes/Ajam/Ajam.node.json`: n8n codex metadata.
- `package.json` `n8n` field: registers node and credential build outputs.

## Current Actions

### Daily Reminder: List Missing Timesheet Users

Calls:

```http
POST /api/internal/reminders/daily-timesheet
```

with:

```json
{
  "action": "list"
}
```

The node can either return the raw API response or split `targets` into one n8n item per user. The split mode is the default because it connects directly to email nodes.

### Daily Reminder: Mark Reminder Sent

Calls the same API with:

```json
{
  "action": "mark-sent",
  "dateKey": "2026-05-29",
  "email": "person@example.com",
  "userId": "user-id"
}
```

Use this after the email send node succeeds.

### Notion: Run Daily Maintenance

Calls:

```http
POST /api/internal/notion/daily-maintenance
```

with an optional date:

```json
{
  "dateKey": "2026-06-16"
}
```

When `dateKey` is empty, aJam uses today's date in `Asia/Seoul`. The action checks each user's Notion connection, syncs Notion cards open on that date into the aJam cache, and updates mapped Notion fields for active cards that have no end date and are not in the user's configured done statuses. This keeps fields such as `가용 시간`, `업무 기간 시간`, `작업일수`, and mapped `aJam 업데이트 시간` fresh without blocking normal timesheet entry. `마지막 작업일` is intentionally updated by aJam timesheet save/delete and manual field update flows, not by daily maintenance.

The `aJam` node has two outputs:

- `Summary`: always emits the operation result.
- `Alerts`: emits one email/Slack-ready item only when Notion daily maintenance has errors. Connect this output directly to an Email or Slack node; no IF node is needed.

## Adding More Actions

Prefer adding new operations to the existing `aJam` node before creating a second node. Add a new resource only when the workflow domain is meaningfully different.

Suggested growth path:

- Add a resource option in `Ajam.node.ts`.
- Add operation options under that resource.
- Reuse the `aJam API` credential.
- Add the matching aJam backend API under `apps/web/src/app/api/internal`.
- Document the action here and in `docs/architecture.md` when it changes backend behavior.

## Build

```powershell
pnpm --filter @junglesub/n8n-nodes-ajam build
```

The build emits JavaScript and copies the codex/icon assets into `dist`.

Create a tarball:

```powershell
pnpm --filter @junglesub/n8n-nodes-ajam pack --pack-destination ../../dist
```

## Local n8n Install

Install the package into n8n's custom extensions directory. This is a local install, not a global package install.

```powershell
New-Item -ItemType Directory -Force $env:USERPROFILE\.n8n\custom
Set-Location $env:USERPROFILE\.n8n\custom
pnpm add C:\path\to\ajam\dist\junglesub-n8n-nodes-ajam-0.3.0.tgz
```

Restart n8n after installation.

## Docker n8n Install

For a self-hosted n8n container, mount or copy the tarball into the container and install it under `/home/node/.n8n/custom`.

```bash
mkdir -p ./n8n-custom
cp ./dist/junglesub-n8n-nodes-ajam-0.3.0.tgz ./n8n-custom/
docker compose exec -u node n8n sh -lc "mkdir -p /home/node/.n8n/custom && cd /home/node/.n8n/custom && pnpm add /home/node/.n8n/custom/junglesub-n8n-nodes-ajam-0.3.0.tgz"
docker compose restart n8n
```

If the n8n image does not include `pnpm`, enable it inside the container with Corepack before running the install:

```bash
docker compose exec -u node n8n sh -lc "corepack enable && cd /home/node/.n8n/custom && pnpm add /home/node/.n8n/custom/junglesub-n8n-nodes-ajam-0.3.0.tgz"
```

## GitHub Packages Install

Create or edit `.npmrc` in n8n's custom extensions directory:

```ini
@junglesub:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PACKAGES_TOKEN
```

Then install the package:

```bash
cd ~/.n8n/custom
pnpm add @junglesub/n8n-nodes-ajam
```

Or with npm:

```bash
cd ~/.n8n/custom
npm install @junglesub/n8n-nodes-ajam
```

GitHub Packages npm registry requires an access token even when installing public packages. You can also install without creating an `.npmrc` file by passing registry and token as one-time CLI options:

```bash
pnpm add @junglesub/n8n-nodes-ajam \
  --registry=https://npm.pkg.github.com \
  --//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PACKAGES_TOKEN
```

```bash
npm install @junglesub/n8n-nodes-ajam \
  --registry=https://npm.pkg.github.com \
  --//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PACKAGES_TOKEN
```

Because shell support for special characters in CLI options varies, the `.npmrc` method is the most stable option for servers.

For a Docker n8n container:

```bash
docker compose exec -u node n8n sh -lc "mkdir -p /home/node/.n8n/custom && cd /home/node/.n8n/custom && printf '@junglesub:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=%s\n' '$GITHUB_PACKAGES_TOKEN' > .npmrc && pnpm add @junglesub/n8n-nodes-ajam"
docker compose restart n8n
```

## In n8n

After restart:

1. Create an `aJam API` credential.
2. Set `Base URL` to the deployed aJam URL, for example `https://ajam.example.com`.
3. Set `Internal API Token` to the same value as `AJAM_INTERNAL_API_TOKEN` in aJam.
4. Add the `aJam` node to a workflow.
5. Use `Daily Reminder > List Missing Timesheet Users`, send email, then call `Daily Reminder > Mark Reminder Sent`.
