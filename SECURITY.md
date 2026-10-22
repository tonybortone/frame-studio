# Security

Frame Studio is under active alpha development. Security fixes target the latest source and alpha version; older alpha builds may not receive backports.

## Report a vulnerability

Use **Security → Report a vulnerability** on GitHub if private vulnerability reporting is enabled. If it is unavailable, open a minimal issue requesting a private reporting channel without publishing exploit steps, private media, credentials, or sensitive project files.

Include the affected version, operating system, reproduction steps, likely impact, and a minimal non-sensitive sample when a private channel is established. Please allow time for a fix before publishing detailed exploit information.

## Relevant boundaries

- Project files, filenames, SVG, and imported media are untrusted inputs.
- Renderer code should not receive arbitrary filesystem or shell access.
- Desktop file access should remain behind narrowly scoped, validated IPC handlers and user file dialogs.
- Do not add remote content execution or broaden Electron permissions to solve renderer limitations.
- Never commit signing certificates, API keys, tokens, or private media.

The alpha's file size limit is a usability guard, not a guarantee against malformed input or resource exhaustion. Keep import validation and SVG sanitization in the core layer, and test those boundaries when changing them.
