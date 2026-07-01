# @junglesub/n8n-nodes-ajam

Custom n8n community node package for aJam automation.

## Nodes

- `aJam`
  - `AI Cleanup > Run Scheduled Cleanup`
  - `Daily Reminder > List Missing Timesheet Users`
  - `Daily Reminder > Mark Reminder Sent`
  - `Notion > Run Daily Maintenance`

The node has two outputs:

- `Summary`: normal operation results.
- `Alerts`: alert-ready items for failed Notion maintenance or AI cleanup runs. This output is empty when there are no automation errors.

## Credentials

Create an `aJam API` credential in n8n:

- `Base URL`: deployed aJam URL, for example `https://ajam.example.com`
- `Internal API Token`: same value as `AJAM_INTERNAL_API_TOKEN` in aJam

## Local Install

Build the package from the repository root:

```powershell
pnpm --filter @junglesub/n8n-nodes-ajam build
```

Install from the public npm registry:

```bash
pnpm add @junglesub/n8n-nodes-ajam
```

## Publish

The package publishes to the public npm registry. GitHub Actions publishes automatically when the package `version` changes on `main` and n8n node verification passes. The repository secret `NPM_TOKEN` must contain an npm automation token.

Manual publish, if needed:

```bash
pnpm --filter @junglesub/n8n-nodes-ajam build
cd packages/n8n-nodes-ajam
pnpm publish --access public
```
