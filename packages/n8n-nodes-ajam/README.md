# @junglesub/n8n-nodes-ajam

Custom n8n community node package for aJam automation.

## Nodes

- `aJam`
  - `Daily Reminder > List Missing Timesheet Users`
  - `Daily Reminder > Mark Reminder Sent`

## Credentials

Create an `aJam API` credential in n8n:

- `Base URL`: deployed aJam URL, for example `https://ajam.example.com`
- `Internal API Token`: same value as `AJAM_INTERNAL_API_TOKEN` in aJam

## Local Install

Build the package from the repository root:

```powershell
pnpm --filter @junglesub/n8n-nodes-ajam build
```

Install from GitHub Packages:

```bash
pnpm add @junglesub/n8n-nodes-ajam
```
