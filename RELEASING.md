# Releasing & automatic updates

MedLib M3 updates itself. The shop PC never needs a USB stick or a manual
reinstall: it checks GitHub on startup and installs new versions in place.

``` text
dev PC                         GitHub                          shop PC
------                         ------                          -------
npm run release        --->    Actions builds the installer,
                               signs it, publishes a Release
                               + latest.json
                                                       <---    app starts, reads latest.json
                                                               "Mise à jour disponible"
                                                               download -> install -> restart
```

Everything is free: GitHub Actions builds, GitHub Releases hosts the files.
No server of ours is involved and the POS keeps working offline - Internet
is only used for the few seconds of the check.

## Shipping a version

1. Make sure your work is committed and `main` is pushed.
2. Run one of:

   ``` bash
   npm run release            # patch: 0.1.0 -> 0.1.1  (bug fixes)
   npm run release minor      # 0.1.0 -> 0.2.0        (new features)
   npm run release major      # 0.1.0 -> 1.0.0
   npm run release 1.2.3      # explicit version
   ```

   The script bumps the version in `package.json`, `package-lock.json`,
   `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `Cargo.lock`,
   commits `Release vX.Y.Z` and pushes. It refuses to run on a dirty tree,
   off `main`, behind `origin/main`, or for a version that already exists.

3. Wait ~10-15 minutes. Follow progress under **Actions** on GitHub. When
   the workflow is green, the release is live at
   `https://github.com/Rayane3103/medlib-m3/releases`.

4. On the shop PC, the next app launch shows the update dialog with the
   release notes (the commit messages since the previous release - write
   them in French with the cashier in mind). *Paramètres → Mises à jour →
   Vérifier* forces a check without restarting.

That is the whole process. Pushing to `main` without bumping the version
builds nothing - the workflow sees the version is already released and
stops - so day-to-day pushes are safe.

## How the pieces fit

| Piece | Where | Role |
|---|---|---|
| Updater plugin | `src-tauri` (`tauri-plugin-updater`, `tauri-plugin-process`) | Fetches `latest.json`, compares versions, verifies the signature, runs the installer, restarts |
| Endpoint + public key | `src-tauri/tauri.conf.json` → `plugins.updater` | Where to look and which signature to trust |
| UI | `src/components/updater/UpdaterProvider.tsx`, `src/pages/Settings.tsx` | Silent check 4 s after startup; dialog only when an update exists; manual check + error details in Settings |
| Workflow | `.github/workflows/release.yml` | On push to `main`: build + sign + publish when the version is new |
| Release script | `scripts/release.mjs` (`npm run release`) | Bumps the version everywhere and pushes |

The installer runs per-user (`installMode: currentUser`) so updates never
ask for administrator rights, and in *passive* mode (a small progress
window, no questions). The updater closes the app before the installer
starts and the installer relaunches it.

## The signing key - do not lose it

Every update is signed with a private key; the matching public key is
compiled into the app. An installed app **refuses** any update that isn't
signed with that key. This is what stops someone from feeding the shop PC a
fake installer, and it also means:

> If the private key or its password is lost, existing installs can never
> update again. The only way out is a manual reinstall on every PC.

Where it lives:

- `C:\Users\<you>\.tauri\medlib-m3.key` - the private key
- `C:\Users\<you>\.tauri\medlib-m3.key.password` - its password
- `C:\Users\<you>\.tauri\medlib-m3.key.pub` - public key (also in `tauri.conf.json`)
- GitHub → repo **Settings → Secrets and variables → Actions**:
  `TAURI_SIGNING_PRIVATE_KEY` (contents of the `.key` file) and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Back the first two files up somewhere that is *not* this PC (password
manager, encrypted USB stick). They are ignored by git on purpose and must
never be committed.

## Building a signed installer locally

`tauri build` needs the key too now that `createUpdaterArtifacts` is on:

``` powershell
# The *content* of the key, not its path - the bundler ignores TAURI_SIGNING_PRIVATE_KEY_PATH.
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\.tauri\medlib-m3.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = Get-Content "$env:USERPROFILE\.tauri\medlib-m3.key.password" -Raw
npm run tauri build
```

The installer lands in `src-tauri/target/release/bundle/nsis/` next to its
`.sig` file. `npm run tauri dev` does not need the key, and the updater
does nothing in dev mode.

## First install on a new PC

Download `MedLib.M3_X.Y.Z_x64-setup.exe` from the latest release and run
it. Windows SmartScreen shows "unknown publisher" the first time because
the installer isn't code-signed with a paid certificate - choose *More
info → Run anyway*. Automatic updates afterwards do not show this prompt.

An install made before the updater existed (< v0.2.0) has no way to update
itself; reinstall it once by hand from the releases page.

## Rolling back

Releases are immutable once published. To undo a bad version, fix the
problem (or `git revert` it) and ship a *higher* version - installed apps
only ever move forward. Deleting a release on GitHub only stops new
installs from finding it; it doesn't downgrade anyone.

## Troubleshooting

- **Workflow failed at the tauri-action step with a signing error** - a
  secret is missing or mistyped. Re-paste both secrets; the key value is the
  whole one-line content of the `.key` file.
- **Workflow ran but skipped the build** - the version in
  `src-tauri/tauri.conf.json` already has a release tag. Bump it.
- **App says "Impossible de contacter le serveur"** - no Internet, or GitHub
  is unreachable from that network. The POS is unaffected; retry later.
- **App says the update is not authentic** - the release was signed with a
  different key than the one compiled into the installed app. Don't ignore
  this; it means either the key was regenerated (see above) or the release
  was tampered with.
