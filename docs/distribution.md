# Mac distribution

Frame Studio's source is available for local development. The initial packaging configuration produces an **Apple Silicon (arm64)** Mac application, DMG, and ZIP. A successfully built local package is not the same as a signed, notarized public release.

## Local packaging

On an Apple Silicon Mac with Node.js 22.20+ or 24+:

```sh
npm ci
npm test
npm run package:mac
```

Artifacts are written to `release/`. The package script includes `--publish never`, so it does not upload anything. With no signing identity configured, treat generated artifacts as unsigned development builds. macOS can restrict opening unsigned downloads.

The current configuration does not target Intel Macs, include an automatic update service, or create a Mac App Store submission.

## Public release checklist

Before offering the app broadly:

1. Verify the final app name, icon, bundle identifier, version, minimum supported macOS version, and supported architectures.
2. Configure an Apple Developer signing identity securely. Keep certificates, private keys, and notarization credentials out of the repository.
3. Review the Electron shell, allowed IPC operations, content security policy, and bundled dependencies.
4. Sign the app with the required runtime settings, submit it for Apple notarization, and staple the resulting ticket where appropriate.
5. Validate the exact downloadable DMG/ZIP on a clean Mac, including install, first launch, project save/reopen, import, playback, export, and removal.
6. Publish versioned GitHub Release assets with release notes, checksums, platform requirements, and known limitations.

Signing/notarization credentials and release publishing are deliberately absent from the initial CI. Add a reviewed release workflow once those prerequisites are in place.

## Continuous integration

The initial workflow installs the committed dependency tree on Node 24, runs tests, and builds the renderer. It verifies source changes but does not prove macOS packaging, media codec support, signing, notarization, or the downloaded installer experience.

Future release automation should separate ordinary pull-request checks from trusted release jobs. Fork pull requests must never receive signing secrets. A tagged version should be traceable to the exact source, lockfile, checks, and assets that produced it.
