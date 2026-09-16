# Security and privacy

This early-stage app is intended for local use or a small trusted workspace. It does not implement multi-user identity, durable job storage, or enterprise access controls.

- Keep `DEEPSEEK_API_KEY` in the server environment or ignored `.env` file.
- The browser Settings token is a separate shared workspace secret, kept in tab memory.
- Non-loopback startup requires a workspace token with at least 24 characters. Use a randomly generated token, TLS, a correctly configured `PUBLIC_ORIGIN`, and a reverse proxy for remote use.
- Do not publish `.env`, proxy logs containing Authorization headers, or private transcript screenshots.
- DeepSeek receives submitted text and recent conversation context. Browser speech recognition can send audio to the browser vendor’s service. System speech voices may also use remote services. This is not an offline privacy guarantee.
- The app itself has no analytics or transcript database. The demo sends no requests to DeepSeek, but microphone usage can still contact browser speech services.
- Closing the tab, cancelling a request, or interrupting playback does not undo processing already performed by a provider.

For a suspected vulnerability, use GitHub’s private vulnerability reporting if enabled on this repository. Otherwise open an issue requesting a private contact without including exploit details, credentials, or user data. Do not post secrets in public issues.
