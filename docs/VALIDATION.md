# Validation record

Date: 2026-09-16. Environment: macOS, Node.js 25.9.0, Codex in-app Chromium browser. The public repository is [hangi7890/deepseek-live](https://github.com/hangi7890/deepseek-live). Remote CI on **Node 22 and Node 24 passed** for implementation commit `8fa16a8`: [verified workflow run](https://github.com/hangi7890/deepseek-live/actions/runs/35088349352).

## Automated checks

`npm run check`: JavaScript syntax checks passed.

`npm test`: **30 tests passed** after the recovery and mobile milestone (the original release had 16), including:

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
- Actual client source executed against deterministic DOM, recognition, synthesis, timer, and fetch doubles: microphone restart races, pending transcript cancellation, rapid request replacement, independent analysis cancellation, session reset, stale speech callbacks, muted chunks, incomplete streams, and analysis concurrency.

The first nine client tests were also run against the original `a2b39ee` app source in an isolated temporary fixture. Two failed: an old recognition error aborted the replacement microphone, and a cancelled utterance emitted a late error notice. Both pass with the fixes. Five further client tests cover retained drafts on missing authentication/offline configuration/oversized input, explicit retry after a non-JSON HTTP failure, unsupported or denied recognition, and IME/keyboard behavior. The full current suite passes 30/30 locally. This proves the simulated lifecycle cases, not real microphone or acoustic quality. Remote CI for these changes must be checked separately from the initial release CI linked above.

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

A follow-up viewport override successfully applied at **390 × 844 CSS pixels**. DOM measurements confirmed `innerWidth === scrollWidth === 390`. Main panels, the settings dialog, and composer were visually inspected; Enter submitted a Korean-text question and received a complete scripted response. After mobile control improvements, the send button measured 44 × 44px and composer text measured 16px. This is desktop Chromium with a narrow viewport, not a physical phone or mobile keyboard test.

A fresh temporary copy of tracked source, without `.env` or `node_modules`, started the application HTTP server and served HTML, demo configuration, and completed English/Korean demo streams. No package installation or provider key was needed. This check used the exported server factory; the exact `npm start` command and physical-device behavior are separate checks.

## Not verified

- Live DeepSeek requests: no API key configured at validation time.
- Actual microphone permission, recognition quality, speaker echo, interruption audio, and TTS audibility on physical devices. Permission errors and unsupported recognition were tested with platform doubles only.
- End-to-end voice latency, p50/p95, cost, sustained load, and comparison with GPT-Live.
- Docker runtime: packaging provided, container not executed in this environment.

## Reproduce a real voice check

1. Set the server API key and restart. Confirm API CONFIGURED (configuration alone does not validate the key).
2. In Chrome over localhost or HTTPS, enable microphone recognition with headphones connected.
3. Ask an English and a Korean question; check transcripts, answer correctness, and spoken output.
4. Interrupt mid-sentence. Confirm speech stops and no old queued sentence resumes.
5. Start Deep think, ask a separate question, interrupt it, then wait for the analysis.
6. Cancel a second analysis; confirm it cannot later show Complete.
7. Try denied microphone permission, a revoked provider key, offline networking, and a physical phone (the 390px desktop viewport has been checked).
8. Record device, browser, model, network, sample count, and failures. Measure first audible output separately from first text token timing.
