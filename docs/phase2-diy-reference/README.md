# Phase 2 DIY Reference (Archived)

> **RecruitPilot AI** — archived documentation, not part of the current build.

These four documents are the **original DIY voice-pipeline docs** from before the
project pivoted to the **Bolna** managed voice-agent platform (see the ADR in doc 02
and the new architecture in doc 01):

| File | What it covered |
|---|---|
| `05_EXOTEL_SETUP.md` | Exotel CPaaS account, ExoPhone, Voicebot WebSocket applet, StatusCallback webhooks |
| `06_DEEPGRAM_SETUP.md` | Deepgram streaming STT — model choice, endpointing, Indian-English tuning |
| `08_ELEVENLABS_SETUP.md` | ElevenLabs TTS — Flash model, streaming-input WebSocket, `ulaw_8000` output |
| `17_VOICE_PIPELINE.md` | Hand-built orchestration: jitter buffers, barge-in, turn-taking, the full audio loop |

They are preserved **unchanged** as an **optional future deep-learning phase**
(see doc 20's roadmap): building the pipeline by hand — sockets, codecs, barge-in,
latency budgets — is the best way to truly understand what Bolna does for us. If
Bolna ever disappoints, these docs are also the starting point for executing the
DIY fallback.

**Do not follow these docs for the current build.** The live docs they were
replaced by:

- `05_EXOTEL_SETUP.md` → `docs/05_BOLNA_SETUP.md`
- `06_DEEPGRAM_SETUP.md` → `docs/06_BOLNA_AGENT_CONFIG.md`
- `08_ELEVENLABS_SETUP.md` → `docs/08_BOLNA_WEBHOOKS.md`
- `17_VOICE_PIPELINE.md` → `docs/17_CALL_LIFECYCLE.md`

Cross-references inside these archived files (e.g., "doc 01 §3.4") point at the
**old** doc suite and may no longer resolve — read them as historical context.
