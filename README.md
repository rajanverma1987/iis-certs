# IIS Cert Manager

Windows Electron app for requesting and renewing **Let's Encrypt** certificates for **IIS** sites.

## Features

- Lists all IIS websites and hostname bindings
- Shows certificate status: missing / All Good / Expiring (≤ 7 days) / expired
- **Request** (no cert) or **Renew** (existing cert) per site
- **Renew all** for eligible sites
- HTTP-01 validation via `.well-known/acme-challenge/` files in the site physical path
- Imports PFX into the Windows certificate store and updates IIS HTTPS/SNI bindings
- Manual renewal only (no certificate auto-renew service)
- App auto-update from **GitHub Releases** (`electron-updater`)

## Requirements

- Windows with **IIS** installed (`WebAdministration` PowerShell module)
- Run the app **as Administrator**
- Public DNS for site hostnames pointing at this server
- Port **80** reachable for HTTP-01 validation
- Hostname bindings on IIS sites (blank/`localhost` hostnames are skipped)

## Development

```bash
npm install
npm run electron:dev
```

On macOS/Linux the UI loads, but IIS/certificate operations are disabled.

```bash
npm run build
npm start
```

## Production build (Windows)

```bash
npm run dist
```

Installer output: `release/IIS Cert Manager-Setup-<version>.exe`

## Publish updates (GitHub Releases)

Updates publish to **https://github.com/rajanverma1987/iis-certs** (configured in `update.config.ts` and `package.json`).

On Windows (or via the included GitHub Actions workflow):

```bash
set GH_TOKEN=ghp_your_token
npm version patch
git push --follow-tags
npm run publish
```

Or push a tag `v1.0.1` to trigger [`.github/workflows/release.yml`](.github/workflows/release.yml) on `windows-latest`.

Packaged installs check GitHub Releases on launch, download updates, and prompt to restart.

## First-run setup

1. Open **Settings** and enter a Let's Encrypt contact email.
2. Refresh the site list, then **Request** a certificate for a site with public hostnames.

## Notes

- ACME account keys are **DPAPI-protected** (LocalMachine) and stored under Electron `userData` with Administrators/SYSTEM-only ACLs.
- Certificate private keys are imported **non-exportable** into the Local Machine store.
- Temporary PFX/param files are overwritten then deleted after use.
- Certificates are issued from Let's Encrypt **production**.
- Unsigned Windows builds may show SmartScreen warnings until you add Authenticode signing.

## Security posture

- Renderer: `contextIsolation`, `sandbox`, no Node integration, strict CSP, navigation lock
- IPC: trusted-sender checks + input validation (site id, email, domains, thumbprints)
- PowerShell: `-EncodedCommand` + JSON param files (no string-concat secrets in scripts)
- Challenge tokens validated; path traversal blocked for HTTP-01 files
