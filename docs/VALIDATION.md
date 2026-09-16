# Validation record

Date: 2026-09-16. Environment: macOS, Node.js 25.9.0, Codex in-app Chromium browser. CI is configured for Node 22 and 24; a local run on Node 25 is not evidence that remote CI has run.

## Automated checks

`npm run check`: JavaScript syntax checks passed.

`npm test`: **16 tests passed**, including:

- Fragmented UTF-8 Korean and CRLF SSE; multiline data and heartbeat comments.
- Oversized or truncated SSE frames; missing provider terminal marker.
- Message shape, role, history length, and total content limits.
- Provider request models/modes and sanitization of upstream errors.
- Private reasoning text is not relayed to the client.
- Static file allowlist and omission of secrets from public configuration.
- Cross-origin, hostile Host, auth and content-type rejection.
- SSE timing and completion events.
- Foreground cancellation leaves a concurrent analysis running.
- Active request concurrency limit.

Provider tests use a mock fetch implementation; server tests run real local HTTP streams with deterministic providers. They do not incur API charges or establish real-world model performance.

## Browser checks

- Initial UI and explicit SCRIPTED DEMO label render.
- A background analysis and foreground response can run together and complete separately.
- Discuss result places the analysis in the composer without sending automatically.
- Interrupt marks the current reply interrupted.
- New session removes conversation and analysis state.
- Korean language selection produces the scripted Korean response.
- Browser error/warning log was empty during the checked flow.
- Layout observed at desktop and 884px width, with the background panel moving beneath the two main panels and no horizontal overflow.

An attempted 390px browser viewport override did not apply in this browser environment (the measured width remained 884px). The small-screen CSS is implemented, but **a true phone-width visual check remains outstanding**.

## Not verified

- Live DeepSeek requests: no API key configured at validation time.
- Actual microphone permission, recognition quality, speaker echo, interruption audio, and TTS audibility on physical devices.
- End-to-end voice latency, p50/p95, cost, sustained load, and comparison with GPT-Live.
- Docker runtime: packaging provided, container not executed in this environment.
- Remote GitHub CI or a public release, until the repository is actually published and the workflow runs.

## Reproduce a real voice check

1. Set the server API key and restart. Confirm API CONFIGURED (configuration alone does not validate the key).
2. In Chrome over localhost or HTTPS, enable microphone recognition with headphones connected.
3. Ask an English and a Korean question; check transcripts, answer correctness, and spoken output.
4. Interrupt mid-sentence. Confirm speech stops and no old queued sentence resumes.
5. Start Deep think, ask a separate question, interrupt it, then wait for the analysis.
6. Cancel a second analysis; confirm it cannot later show Complete.
7. Try denied microphone permission, a revoked provider key, offline networking, and a 390px screen.
8. Record device, browser, model, network, sample count, and failures. Measure first audible output separately from first text token timing.
