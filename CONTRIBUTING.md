# Contributing

Start with Node.js 22 or 24 and `npm start`. No install step is required. Read the architecture and research documents before changing speech behavior.

Good first contributions:

- Add Korean UI localization without changing conversation language selection.
- Improve sentence chunking around abbreviations, decimals, and code.
- Add deterministic voice event fixtures for pauses, self-corrections, and echo.
- Document tested microphone/browser combinations with reproducible steps.
- Propose a streaming STT/TTS adapter with an explicit privacy and dependency model.

For a PR, describe the problem, changed behavior, and verification. Run `npm run check` and `npm test`. Preserve explicit demo labeling and the distinction between cascaded voice and native full-duplex. Include keyboard behavior and a narrow-screen check for UI changes.

Never submit API keys, private conversations, recordings of other people without permission, or invented performance numbers. Benchmark reports should include hardware, browser, network, model, sample count, percentile definitions, and both successes and failures.

Please keep discussions constructive. Small focused PRs are easier to review. There is no promise of a particular response time or roadmap delivery date.
