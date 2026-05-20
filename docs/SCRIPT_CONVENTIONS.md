# Script Conventions

Nathan's primary dev machine runs Windows with PowerShell. CI runs
on Linux. All npm scripts and shell scripts in this repo must work
on both.

## Env vars in npm scripts

Always use cross-env:

```json
"my-script": "cross-env FOO=bar tsx scripts/my-script.ts"
```

Never use bash-style inline env vars:

```json
"my-script": "FOO=bar tsx scripts/my-script.ts"   // BROKEN on Windows
```

## Path separators

Use forward slashes in npm script paths (Node handles both). Don't
hardcode backslashes.

## Multi-step scripts

Use npm-run-all or && (which works in both shells for sequential
commands, even though && originated in POSIX). Avoid semicolons
which have different meaning in PowerShell.

## Admin scripts that touch Firestore

One-off scripts like scripts/setLincolnPhonicsLevel.ts require:
- GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service
  account key JSON file (NOT committed to the repo)
- Firebase admin SDK, which lives in functions/node_modules
- NODE_PATH=functions/node_modules so the admin SDK resolves

Run them as:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\key.json"
npm run set:lincoln-level
```

The npm script handles NODE_PATH via cross-env. The caller only
needs to set GOOGLE_APPLICATION_CREDENTIALS because it's
machine-specific and should not be hardcoded.
