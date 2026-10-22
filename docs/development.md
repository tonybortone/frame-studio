# Development

## Prerequisites

- Node.js **22.20+ or 24+** and npm; use Node 24 to match CI.
- macOS on Apple Silicon for the current packaged desktop target.
- A modern browser for the web development preview. Media codec support varies by browser and Electron version.

Install dependencies with `npm install` for initial setup, or `npm ci` for a reproducible install from the committed lockfile.

## Commands

| Command                | Purpose                                                 |
| ---------------------- | ------------------------------------------------------- |
| `npm run dev`          | Start the renderer development server on localhost      |
| `npm run build`        | Type-check and build the renderer into `dist/`          |
| `npm run preview`      | Serve the built renderer locally                        |
| `npm test`             | Run the core test suite once                            |
| `npm run test:e2e`     | Run the Playwright browser suite                        |
| `npm run desktop`      | Build the renderer, then launch Electron                |
| `npm run package:mac`  | Build and package arm64 DMG/ZIP artifacts in `release/` |
| `npm run format`       | Format source and documentation with Prettier           |
| `npm run format:check` | Check formatting without changing files                 |

For browser tests, install the required Playwright browser first:

```sh
npx playwright install chromium
npm run test:e2e
```

The browser suite starts or reuses the local editor on port 4175. It uses installed Google Chrome on macOS when available, otherwise Playwright Chromium. Run `npm run format` before submitting changes; `npm run format:check` verifies the result.

The desktop command starts the built renderer, so restart it after rebuilding to see source changes. Use the development server for quick UI iteration.

## Verification

The required CI checks are `npm test` and `npm run build`. Browser and desktop checks are additional checks for changes that affect interaction, media, rendering, or the shell.

Use short media files with known durations to verify timeline changes. Check both the start and end of trimmed clips; split clips should preserve source offsets. Import, save, reopen, and export the same composition when changing serialization or rendering.

For visible editor changes, verify a small window, pointer and keyboard use, selection and grouping, and readable contrast. For export changes, check the actual downloaded file in a media player, including audio, duration, dimensions, and whether the final frame is present. Runtime format detection alone does not prove the output is correct.

Use media you own or have permission to redistribute. Keep fixtures small and include their license. Do not commit generated `dist/`, `release/`, dependency folders, or personal project files.

## Working agreements

Use explicit TypeScript types at model, import, and IPC boundaries. Keep pure operations testable without mounting the editor. Reuse the renderer's composition logic for output so preview and export behavior stay aligned.

Surface failures in the UI instead of silently discarding an import or export. Keep irreversible/destructive actions distinct from selection and navigation. Document limitations as they are discovered rather than advertising planned behavior as complete.
