# Contributing to Frame Studio

Thank you for helping make editing more approachable. Keep changes small enough to review and connect them to a concrete editing task.

## Development

1. Fork and clone the repository.
2. Install Node.js 22.20+ or 24+; Node 24 matches CI.
3. Run `npm ci` using the committed lockfile.
4. Run `npm run dev` for the browser editor or `npm run desktop` on Mac.
5. Make a focused change on a branch.
6. Run `npm test` and `npm run build` before submitting it.

The [development guide](docs/development.md) covers commands and checks. Read the [architecture](docs/architecture.md) before changing rendering or project data.

## Pull requests

Explain the problem, the resulting behavior, and how you verified it. Include a screenshot or short recording for visible changes. Mention any changes to project compatibility, import support, export formats, dependencies, or permissions.

Keep editor data separate from UI state. Prefer small typed functions for timeline and geometry operations. Keep pure model code independent of React and Electron. Add meaningful tests for behavior changes, especially trim/split math, project validation, and import/export boundaries; avoid tests that only repeat implementation details.

Do not silently change existing saved projects. Schema changes need a versioning and migration plan. Maintain the semantic layer colors and provide text labels as well as color cues. Honor reduced-motion preferences in interface animation.

## Issues and feature ideas

For a bug, include the app version, macOS/browser version, steps to reproduce, expected behavior, and actual behavior. A minimal project is useful; remove personal media and confidential information first.

For a feature, describe the editing task and a concrete example. Compare it with the [roadmap](docs/roadmap.md) so related work can be discussed together. Open an issue before a substantial architectural change.

## Source and assets

Contribute code and assets you have the right to share under the project's license. Do not copy proprietary product source, icons, templates, fonts, or demonstration footage. Add attribution and license information when introducing third-party material. Dependency additions should explain their purpose, footprint, and license.

By submitting a contribution, you agree that your contribution may be distributed under the project's MIT License.
