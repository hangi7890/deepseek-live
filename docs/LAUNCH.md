# Launch kit

This is prepared launch copy, not a record of posts made or a promise of stars. Do not claim a public repository, release, or live provider verification until it actually exists.

## Repository metadata

- Name: `deepseek-live`
- Description: `Interruptible voice conversations with DeepSeek, independent background reasoning, and zero runtime dependencies. English + Korean. MIT.`
- Suggested topics: `deepseek`, `voice-assistant`, `speech-recognition`, `text-to-speech`, `streaming`, `conversational-ai`, `javascript`, `nodejs`, `open-source`, `korean`
- First release: `v0.1.0` — `Interruptible voice + independent reasoning`
- Social preview: `docs/banner.svg` is original vector artwork; rasterize it for platforms that require PNG. It is an illustration, not a performance demo.

## Release notes draft

DeepSeek Live v0.1 is a small voice workspace with two independent paths: a fast conversation and opt-in deeper reasoning. Interrupt the spoken answer without cancelling the analysis, then bring the result back when you want it.

Includes browser speech recognition/synthesis, English and Korean conversation settings, streaming transcripts, analysis cards, explicit no-key scripted demo, server-side credentials, cancellation and security tests, Docker packaging, and source-based architecture notes.

This is a cascaded STT → DeepSeek → TTS application, not a native full-duplex speech model. Browser speech support varies. Real API and microphone testing must be documented separately from demo results.

## Suggested public announcement (not posted)

I built DeepSeek Live: an open-source voice workspace where you can interrupt a reply while a deeper analysis keeps running in the background.

It starts with `npm start`, has no runtime dependencies, and includes English/Korean speech settings plus a no-key demo. I also wrote up what GPT-Live’s public engineering docs and interviews actually disclose, and what this project does differently.

It’s a cascaded prototype, not a new full-duplex model. I’d love reproducible browser/voice bug reports and help with streaming audio adapters.

## 45-second demo recording plan

1. Show the mode badge and disclose whether this is demo or an actual API session.
2. Start an architecture analysis with Deep think.
3. Ask an unrelated short question while it runs.
4. Interrupt the reply; show the analysis continuing.
5. Discuss the completed result.
6. Show Korean input and the one-command quick start.

Use your own voice and synthetic, non-private questions. Do not splice recordings to imply unmeasured latency. Publish real timing and environment details if making speed claims.

## Useful growth work

Give new visitors a working quick start, an honest capability matrix, and an easy bug template. Share only in communities where self-promotion is welcome. Ask for concrete feedback on one feature. Respond to reproducible bugs and add regression tests. A few credible, useful demonstrations are more valuable than broad performance claims. Do not buy stars, automate fake engagement, or spam issues and communities.

## Publishing from an authenticated machine

The following commands require GitHub CLI (`gh`) and a logged-in account that owns the target repository. If the repository already exists, inspect it first; do not overwrite it.

```bash
gh auth status
gh repo create hangi7890/deepseek-live --public --source=. --remote=origin --push \
  --description "Interruptible voice conversations with DeepSeek, independent background reasoning, and zero runtime dependencies."
gh repo edit hangi7890/deepseek-live \
  --add-topic deepseek --add-topic voice-assistant --add-topic streaming \
  --add-topic speech-recognition --add-topic text-to-speech --add-topic nodejs
```

After verifying CI and reviewing release notes, a maintainer can create the first release. This task does not require posting the announcement to anyone.
