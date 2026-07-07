# 05 — Exotel Setup

> **RecruitPilot AI — Production-Grade AI Executive Voice Assistant**
> Document 05 of 21 · Prerequisites: docs 00–04

---

## 1. Goal

Give the assistant a **real phone number on the Indian PSTN** and wire it to our (future) voice gateway:

- Create and KYC-verify an **Exotel account** — the single longest lead-time item in the entire project, which is why doc 00 told you to start it early.
- Provision a **virtual number (ExoPhone)** that recruiters will dial.
- Obtain and safely store the **API credentials** (Account SID, API Key, API Token, subdomain).
- Build the **call flow**: when someone dials the number, Exotel answers and opens a WebSocket audio stream to our server (the Voicebot / Voice Streaming applet).
- Configure the **StatusCallback webhook** so our API learns when calls start, are answered, and complete — the trigger for the entire async plane (doc 01 §3.6).
- Bridge the local-development gap with **ngrok**, because Exotel can only reach public URLs and our laptop isn't one.

By the end, dialing your ExoPhone reaches a configured flow, and you have verified — with real HTTP responses — that your credentials and webhooks work, *before* a single line of our code exists.

---

## 2. Theory

### 2.1 What is a CPaaS, and what is a virtual number?

You cannot plug your Node.js server into the telephone network. The PSTN is a regulated carrier world of SS7 signaling, interconnect agreements, and telecom licenses. A **CPaaS** (Communications Platform as a Service) — Exotel, Twilio, Plivo — owns that carrier relationship and re-exposes it as HTTP APIs, webhooks, and WebSockets. You rent capability, not infrastructure.

A **virtual number** (Exotel calls theirs an **ExoPhone**) is a real, dialable phone number that terminates *at Exotel's cloud* instead of at a SIM card. When a recruiter dials it, Exotel's switch answers, and then *your configuration* decides what happens next: play audio, forward to a human, or — our case — stream the audio to your server over a WebSocket.

### 2.2 The Indian telecom regulatory reality (read this, it costs you days)

India's telecom sector is regulated by **TRAI** (Telecom Regulatory Authority of India) and the DoT, and the rules are materially stricter than in the US/EU:

- **KYC is mandatory, not optional.** Before Exotel can activate a number for your business, they must verify who you are: business documents (PAN, GST registration or equivalent), address proof, and sometimes a signed agreement. This is Indian law, not Exotel bureaucracy.
- **It takes days, not minutes.** Typically **1–5 business days**, sometimes longer if a document is rejected. Requirements and processing times vary by account type and change over time — treat the numbers here as indicative and the Exotel onboarding UI as authoritative.
- **This is exactly why Exotel exists.** Exotel maintains the carrier interconnects, the DLT registrations for SMS, the number inventory, and the compliance posture — so you don't file paperwork with a Telco. The trade: you follow *their* KYC process.

**Practical consequence:** start the sign-up + KYC **today**, then continue reading while it processes. Everything else in this document can be prepared in parallel; nothing downstream can be *verified* until KYC clears.

### 2.3 How Exotel decides what happens on a call: applets and App Bazaar

When a call hits your ExoPhone, Exotel executes a **call flow** — a chain of building blocks called **applets**. You assemble flows in **App Bazaar**, Exotel's visual drag-and-drop flow builder in the dashboard (Twilio's equivalent concept is TwiML/Studio; Exotel also has an XML-ish representation sometimes called ExoML, but you will mostly click, not write XML). Applets you should recognize:

| Applet | What it does | Do we use it? |
|---|---|---|
| **Greeting / Play** | Plays a recorded or TTS message | Yes — as a temporary flow to verify the number before our server exists |
| **Connect / Dial** | Forwards the call to a real phone | No (that would be… just call forwarding) |
| **IVR / Menu** | "Press 1 for…" DTMF menus | No |
| **Passthru** | Makes an HTTP request to *your* URL mid-flow and uses the response to branch | Optionally — useful for dynamic routing later |
| **Voicebot (Voice Streaming)** | Opens a **bidirectional WebSocket** to your server and streams raw call audio both ways | **Yes — this is the product we're here for** |

### 2.4 Exotel Voice Streaming — the applet that makes an AI agent possible

The **Voicebot applet** (the productized name for Exotel's **Voice Streaming**) is what turns a phone call into something our code can participate in. When the flow reaches it, Exotel:

1. Opens a WebSocket connection **to a URL you configure** (`wss://yourdomain/voice/stream?...`).
2. Streams the caller's audio to you as messages: telephone-grade **8 kHz, mono** audio, delivered as **base64-encoded chunks** inside JSON frames (the codec is telephone PCM/μ-law-family — doc 00 §2.4).
3. Accepts audio *back* on the same socket, which it plays to the caller — this is how our TTS output reaches the recruiter's ear.

The message protocol is event-typed JSON, conceptually very similar to Twilio Media Streams:

| Event | Direction | Meaning |
|---|---|---|
| `start` | Exotel → us | Stream begins; carries call metadata (CallSid, from/to, stream parameters) |
| `media` | both | One chunk of base64 audio payload |
| `stop` | Exotel → us | Call/stream ended |
| `mark` | both | A named checkpoint — "tell me when playback reached this point" (used for barge-in bookkeeping) |
| `clear` | us → Exotel | Flush any audio we already sent but that hasn't played yet (the barge-in kill switch, doc 01 §3.4) |

> **Honesty rule:** the exact JSON field names, the precise codec label (`raw`/`slin`/μ-law), chunk sizes, and whether `mark`/`clear` are supported in your account's version **must be verified against the current Exotel Voice Streaming docs** before doc 17's implementation. This product area evolves, and Twilio's documentation does **not** apply 1:1 — same concepts, different field names and framing. We write the adapter against *verified* current docs, never from memory or from Twilio tutorials.

Also honest: **Voice Streaming may not be enabled by default** on new/trial accounts. If you cannot find the Voicebot applet in App Bazaar, contact Exotel support or your account manager and ask for Voice Streaming / Voicebot access to be enabled. Budget a support round-trip.

### 2.5 Why WebSocket for audio but webhooks for lifecycle?

Two different jobs, two different tools (doc 01 §2.5):

- **Audio is a continuous bidirectional stream** — hundreds of small frames per second, both directions, for minutes. Only a persistent full-duplex connection (WebSocket) fits. HTTP request/response would add a connection handshake per frame.
- **Call lifecycle events are discrete facts** — "call answered", "call completed, duration 214s, recording at this URL". A **webhook** (Exotel POSTs to our HTTPS endpoint) is the right shape: one fact, one request, retried by the vendor if we're down. The **StatusCallback** URL you configure on the flow/number is where these POSTs go. Our API's job on receiving the terminal callback: validate it, then emit `call.completed` onto the event bus — which fans out the whole async plane (transcript persistence, summary, notification — doc 01 §3.6). The webhook handler must be **idempotent**: vendors retry, and a duplicate POST must not enqueue duplicate jobs (keyed by `CallSid`, doc 01 §11).

### 2.6 The local development problem — and ngrok

Exotel lives on the public internet; your laptop sits behind NAT with no public hostname or TLS certificate. Yet the Voicebot applet needs a `wss://` URL and StatusCallback needs an `https://` URL *now*, months before doc 15 deploys to EC2.

**ngrok** (https://ngrok.com) solves this: it opens an outbound tunnel from your machine to ngrok's edge and gives you a public `https://xxxx.ngrok-free.app` URL that forwards to `localhost:3000` — including WebSocket upgrades, so the same hostname works for `wss://`. It is a **development bridge only**: free-tier URLs change on every restart (you re-paste into the Exotel dashboard each time), and nothing about ngrok belongs in production. Doc 15 replaces it with Nginx + a real domain + TLS.

---

## 3. Architecture

### 3.1 Where Exotel sits

Exotel is the **only** component that touches both the PSTN and our system, and it touches us on two distinct paths that map to the two planes of doc 01:

- **Real-time plane:** the Voicebot applet's WebSocket into `features/voice/` (the VoiceGateway).
- **Async plane trigger:** the StatusCallback webhook POST into `features/voice/voice.routes.ts`, which emits `call.completed`.
- **Outbound REST (occasional):** our `providers/exotel/` adapter — implementing the `TelephonyProvider` port from `core/ports/telephony.provider.ts` — calls Exotel's REST API for non-realtime actions: fetching call details, downloading recordings, (later) initiating outbound calls.

### 3.2 The incoming-call sequence

```mermaid
sequenceDiagram
    participant R as Recruiter's phone
    participant EX as Exotel (ExoPhone + flow)
    participant NG as ngrok tunnel (dev)<br/>/ Nginx (prod)
    participant G as VoiceGateway<br/>(features/voice)
    participant BUS as EventBus → BullMQ

    R->>EX: dials ExoPhone (PSTN)
    EX->>EX: answers; App Bazaar flow starts
    EX->>EX: flow reaches Voicebot applet
    EX->>NG: open WSS wss://host/voice/stream?token=...
    NG->>G: forward WS upgrade
    G->>G: verify token (doc 01 §12)<br/>reject if invalid — no session created
    EX->>G: "start" event (CallSid, from, to)
    loop Conversation (doc 01 §3.4)
        EX->>G: "media" (caller audio, base64 8kHz chunks)
        G-->>EX: "media" (assistant audio back)
        Note over G,EX: barge-in → G sends "clear"<br/>to flush unplayed audio
    end
    R->>EX: hangs up
    EX->>G: "stop" event; WS closes
    EX->>NG: POST StatusCallback (completed,<br/>duration, recording URL)
    NG->>G: forward to webhook route
    G->>BUS: emit call.completed
    BUS-->>BUS: persist-transcript → summary →<br/>upsert-recruiter → notify-varun (doc 01 §3.6)
```

### 3.3 Mapping to the folder structure (doc 03)

| Responsibility | Path |
|---|---|
| WS session accept, token check, start/media/stop handling | `apps/api/src/features/voice/voice.gateway.ts` + `voice.session.ts` |
| StatusCallback webhook route + WS route registration | `apps/api/src/features/voice/voice.routes.ts` |
| Audio transcode/buffering for Exotel's 8 kHz format | `apps/api/src/features/voice/audio/` |
| `TelephonyProvider` port (interface) | `apps/api/src/core/ports/telephony.provider.ts` |
| Exotel REST adapter (recordings, call details) | `apps/api/src/providers/exotel/` |

Per doc 03 §12, `features/voice/` is deliberately the **single folder** holding all unauthenticated-inbound surface — the one place to audit webhook verification and WS auth.

---

## 4. Folder Structure

Nothing is created in the repo by this document (implementation lands in docs 09 and 17). Files this doc's outcomes will feed:

```
apps/api/src/
├── core/ports/telephony.provider.ts    # port — no Exotel types here
├── providers/exotel/                   # the ONLY place importing anything Exotel-specific
│   ├── exotel.provider.ts              # implements TelephonyProvider (REST: recordings, call info)
│   └── exotel.types.ts                 # WS event + webhook payload types (verified against docs)
└── features/voice/
    ├── voice.gateway.ts                # WS accept + token auth + event loop
    ├── voice.session.ts
    ├── audio/                          # 8kHz μ-law/PCM ↔ vendor-format transcode
    └── voice.routes.ts                 # /voice/stream (WS) + /voice/status-callback (webhook)
.env                                    # ← the six variables from §8 land here today
.env.example                            # ← documented placeholders, committed
```

---

## 5. Manual Steps

Click-level, from zero. Exotel's dashboard UI evolves — menu names may differ slightly; the *sequence* holds. When in doubt: "verify in the current Exotel docs/dashboard."

### 5.1 Create the account and start KYC (do this first, today)

1. Go to **https://exotel.com** → click **Sign Up** (or **Free Trial**).
2. Register with your project email (varun@digiqc.com per doc 00 §5.3) and your mobile number → verify both (email link + OTP).
3. You land in the dashboard — historically at **my.exotel.com**, newer accounts at **app.exotel.com**; either way it's linked from the site after login.
4. **Complete KYC immediately.** The dashboard will prompt for business verification. For India expect to upload some combination of: **PAN**, **GST registration** (or a declaration if not registered), and **address proof**; an authorized-signatory confirmation may be requested. Exact requirements vary by account type — follow the onboarding checklist in the dashboard.
5. Submit and note the date. Processing is **typically 1–5 business days**. Until approval you may be limited to trial behavior. **Do not block on this — continue with §5.2–5.7 preparation.**

> ⏳ **Trial limitation, honestly:** on a trial account you can generally only place/receive test calls with **verified numbers** (numbers you've confirmed via OTP in the dashboard). Verify your own mobile number there now so you can test the moment your flow exists.

### 5.2 Dashboard tour (5 minutes, saves an hour later)

Log in and locate these areas (names approximate — the UI evolves):

- **Numbers / ExoPhones** — your virtual numbers live here.
- **App Bazaar** (sometimes under "Apps" or "Call Flows") — the visual flow builder.
- **Settings → API** (or "API Credentials" / "Developer") — keys and tokens.
- **Billing / Usage** — where trial credits and pricing appear. We do not quote prices here — they change; see **https://exotel.com/pricing/**.

### 5.3 Get your ExoPhone (virtual number)

1. Dashboard → **Numbers** (ExoPhones) section → **Buy Number** / trial-number option.
2. Trial accounts usually get a shared or temporary number; paid accounts choose from inventory. When choosing: pick a **Mumbai/local** Indian number — recruiters are likelier to answer/return calls to a familiar-looking geography, and it matches our ap-south-1 deployment (doc 01 §3.2).
3. Note the full number in E.164 form (e.g., `+91XXXXXXXXXX`) — this becomes `EXOTEL_VIRTUAL_NUMBER`.

### 5.4 Collect API credentials

1. Dashboard → **Settings → API** (location varies; search the dashboard for "API").
2. Record four values into your password manager (doc 00 §5.2) — **never** into a committed file:
   - **Account SID** — your account identifier (appears in API URL paths).
   - **API Key** — the "username" of the API basic-auth pair.
   - **API Token** — the "password" of the pair. Treat like a root password.
   - **Subdomain** — the API host for your account's cluster: **`api.exotel.com`** vs **`api.in.exotel.com`**. **Indian accounts typically use the `in` cluster** — using the wrong one yields authentication/404 errors that look like broken credentials. Note also that SMS and Voice can have distinct subdomains on some accounts; the dashboard's API page states yours. Verify there.

### 5.5 Generate OUR WebSocket auth token

Exotel will connect to a `wss://` URL that is, by nature, reachable by the whole internet (doc 01 §12, doc 03 §12). We gate it with a long random token **we** generate and append to the URL, so only a party that knows the token (i.e., Exotel, via our applet config) can open a voice session:

```bash
openssl rand -hex 32
```

Store the output as `VOICE_WS_AUTH_TOKEN` (§8). The gateway will compare it on every WS upgrade and drop mismatches before creating any session.

### 5.6 Set up ngrok (the dev bridge)

1. Go to **https://ngrok.com** → sign up (free) → dashboard shows your **authtoken**.
2. Install and authenticate:

```bash
brew install ngrok              # macOS; or download from the dashboard
ngrok config add-authtoken <YOUR_AUTHTOKEN>
```

3. When (from doc 09 onward) your Fastify server runs on port 3000:

```bash
ngrok http 3000
```

4. Copy the `https://xxxx.ngrok-free.app` forwarding URL. The same host serves as `wss://xxxx.ngrok-free.app` for the WebSocket. **This URL changes each restart on the free tier** — every restart means re-pasting into the applet config (§5.7). Annoying, temporary, replaced in doc 15.

### 5.7 Build the call flow in App Bazaar

1. Dashboard → **App Bazaar** → **Create App** (new flow). Name it `recruitpilot-voice`.
2. **Stage 1 (today, before our server exists):** drag a **Greeting/Play** applet as the entry point with any short message. This is a placeholder proving number → flow wiring.
3. **Stage 2 (after doc 09/17):** replace/extend with the **Voicebot (Voice Streaming)** applet, configured with your WSS URL **including the token**:

```
wss://xxxx.ngrok-free.app/voice/stream?token=<VOICE_WS_AUTH_TOKEN>
```

   > If the Voicebot applet is missing from your applet palette, Voice Streaming isn't enabled on your account — **contact Exotel support/your account manager** and request it. Say you're building a voicebot over bidirectional streaming. This can take another support cycle; ask early.
4. **Assign the flow to your ExoPhone**: Numbers section → your ExoPhone → set its incoming-call app to `recruitpilot-voice`. **A flow that isn't assigned to the number does nothing** — this is the most common "why is my number playing the default message" cause.
5. **Set the StatusCallback URL** (on the flow and/or number settings — the dashboard exposes it in one or both places; verify current docs): point it at `https://xxxx.ngrok-free.app/voice/status-callback` — or, for today's verification before our API exists, at a **webhook.site** URL (§9.4).

---

## 6. Official Links

| Topic | Link |
|---|---|
| Exotel — sign up | https://exotel.com |
| Exotel developer docs (API reference) | https://developer.exotel.com |
| Exotel voice streaming | https://developer.exotel.com/api/#voice-streaming |
| Exotel pricing (we quote none here) | https://exotel.com/pricing/ |
| TRAI (regulator context) | https://www.trai.gov.in |
| ngrok | https://ngrok.com |
| ngrok docs | https://ngrok.com/docs |
| webhook.site (webhook inspector) | https://webhook.site |
| Twilio Media Streams (conceptual comparison ONLY — formats differ) | https://www.twilio.com/docs/voice/media-streams |

---

## 7. Commands

```bash
# 1. Generate our WebSocket auth token (once; store in password manager + .env)
openssl rand -hex 32

# 2. ngrok: authenticate once, then tunnel whenever developing
ngrok config add-authtoken <YOUR_AUTHTOKEN>
ngrok http 3000        # copy the https:// forwarding URL; wss:// uses the same host

# 3. Verify Exotel credentials against the REST API (basic auth = key:token).
#    Path shape below is the classic v1 style — CHECK the current API reference
#    at developer.exotel.com for the exact path/version before relying on it.
export EXOTEL_API_KEY="..."; export EXOTEL_API_TOKEN="..."
export EXOTEL_SUBDOMAIN="api.in.exotel.com"; export EXOTEL_ACCOUNT_SID="..."

# List recent calls — a 200 with JSON proves key, token, SID, and cluster are all right:
curl -s "https://$EXOTEL_API_KEY:$EXOTEL_API_TOKEN@$EXOTEL_SUBDOMAIN/v1/Accounts/$EXOTEL_ACCOUNT_SID/Calls.json" | head -c 500

# Expected failures worth recognizing:
#   401 → key/token wrong (or copied with whitespace)
#   403/404 on api.exotel.com but works on api.in.exotel.com → wrong cluster (§10.2)
```

(Optional, trial accounts: the same API can initiate an outbound test call between two *verified* numbers via a POST to `.../Calls/connect.json` — exact parameters in the current API reference.)

---

## 8. Environment Variables

Six variables enter the project today. Per doc 00 §8 conventions: real values in git-ignored `.env` + password manager; placeholders + comments in committed `.env.example`; production values in GitHub Secrets/server env (doc 14/15).

| Variable | Purpose | Where used | Where stored |
|---|---|---|---|
| `EXOTEL_ACCOUNT_SID` | Account identifier; appears in every REST API path | `providers/exotel/` adapter | `.env` / GitHub Secrets |
| `EXOTEL_API_KEY` | Basic-auth username for the REST API | `providers/exotel/` | `.env` / GitHub Secrets |
| `EXOTEL_API_TOKEN` | Basic-auth password — a full-power secret | `providers/exotel/` | `.env` / GitHub Secrets (rotate on any leak) |
| `EXOTEL_SUBDOMAIN` | API cluster host (`api.in.exotel.com` for Indian accounts, typically) | `providers/exotel/` | `.env` / GitHub Secrets |
| `EXOTEL_VIRTUAL_NUMBER` | Our ExoPhone in E.164; used for outbound actions + display | `providers/exotel/`, dashboard display | `.env` (not secret, but config) |
| `VOICE_WS_AUTH_TOKEN` | Token **we** generated (`openssl rand -hex 32`); appended to the WSS URL in the applet so only Exotel can open voice sessions (doc 01 §12 edge auth) | `features/voice/voice.gateway.ts` (checked at WS upgrade) + Exotel applet config | `.env` / GitHub Secrets |

All six are validated at boot by the Zod env schema in `apps/api/src/core/config/` (doc 03 §8) — the server refuses to start with any missing.

---

## 9. Verification

Work through these in order — some gate on KYC.

1. **KYC approved** — dashboard shows verified/active status, no onboarding banner. (If >5 business days: chase support.)
2. **Number active** — ExoPhone listed in Numbers with the `recruitpilot-voice` flow assigned to it.
3. **Credentials work** — the `curl` in §7 returns HTTP 200 with a JSON body (even an empty call list counts). Wrong-cluster and wrong-token failures look different — see the annotations in §7.
4. **StatusCallback fires** — before our API exists, use **https://webhook.site**: opening it gives you a unique URL and a live view of every request that hits it — a webhook inspector requiring zero code. Paste your webhook.site URL as the StatusCallback (§5.7.5), call your ExoPhone from a **verified** phone, hang up, and watch the POST appear with its full payload. Read that payload carefully — those exact field names (`CallSid`, status, duration, recording URL…) are what `voice.routes.ts` will parse in doc 17.
5. **Test call reaches the flow** — dial the ExoPhone from your verified number and hear your Stage-1 greeting applet. (The Voicebot applet can't be end-to-end tested until docs 09/17 give it a server to talk to — the greeting proves number→flow wiring, which is this doc's scope.)
6. **Self-quiz** (from memory):
   1. What is an applet, and which applet makes the AI agent possible?
   2. Why is call audio carried over WebSocket while call lifecycle events arrive as webhooks?
   3. What is the StatusCallback for, and which domain event does our API emit on receiving the terminal one?
   4. What are the five WS event types on the streaming connection, and which one implements barge-in flushing?
   5. Why does `VOICE_WS_AUTH_TOKEN` exist, and who generated it?

---

## 10. Common Mistakes

1. **Starting KYC late.** It gates the number, which gates every live test in docs 06–17. Days of pure waiting that could have run in parallel with reading. (Doc 00 §10.7 warned you; this was why.)
2. **Wrong subdomain cluster.** Hitting `api.exotel.com` with an Indian-cluster account produces auth/404 errors indistinguishable from bad credentials. Check `api.in.exotel.com` first; confirm in your dashboard's API page.
3. **Testing from an unverified number on trial.** The call never reaches your flow and Exotel gives little feedback. Verify your own mobile in the dashboard before any test call.
4. **Forgetting to assign the flow to the ExoPhone.** A flow existing in App Bazaar does nothing until the number points at it. Symptom: default/blank behavior on dialing.
5. **Exposing an unauthenticated WSS endpoint.** `wss://host/voice/stream` with no token means anyone who finds the URL can open sessions — burning your Deepgram/Claude/ElevenLabs budget and injecting garbage. The token check happens at WS upgrade, before any session exists (doc 01 §12).
6. **Assuming Twilio docs apply 1:1.** The concepts (media streams, start/media/stop) match; the JSON field names, audio framing, and applet configuration do not. Every tutorial you find will be Twilio-flavored — always cross-check against current Exotel docs.
7. **Hardcoding the ngrok URL anywhere.** It changes every restart. It lives only in the Exotel dashboard config (re-pasted per session) — never in code, `.env` defaults, or docs.

---

## 11. Production Best Practices

- **Idempotent webhook handling from day one**: Exotel retries StatusCallbacks on non-2xx/timeouts. The handler keys all side effects by `CallSid` (doc 01 §11) — a duplicate POST must be a no-op.
- **Answer webhooks fast, work later**: the StatusCallback handler validates, emits `call.completed`, returns 200 — under ~1s. All real work is BullMQ jobs. A slow handler triggers vendor retries and duplicate storms.
- **Treat the ngrok setup as disposable**: nothing in the repo may depend on a tunnel URL. Doc 15's Nginx + domain + TLS replaces it; the only change should be re-pasting two URLs in the Exotel dashboard.
- **Monitor from the vendor's side too**: Exotel's dashboard call logs are your ground truth when "the call never reached us" — check whether Exotel even attempted the WS/webhook before debugging your own stack.
- **Pin the payload contract with fixtures**: save the real webhook.site payload and a captured WS `start`/`media` frame as test fixtures for `providers/exotel/exotel.types.ts` — the adapter is tested against reality, not documentation memory.
- **Budget awareness**: telephony is per-minute metered. Per-call cost logging (doc 00 §11) includes Exotel minutes alongside STT/LLM/TTS.

---

## 12. Security

The Exotel integration is our **largest unauthenticated-inbound surface** — all of it deliberately confined to `features/voice/` (doc 03 §12) so there is exactly one place to audit.

- **WSS edge auth**: `VOICE_WS_AUTH_TOKEN` checked at WebSocket upgrade; mismatches dropped before session creation (doc 01 §12). The token is a 256-bit random value — unguessable, but it travels in a URL, so it must never appear in logs (Pino redaction, doc 09) and gets rotated on any suspicion.
- **Webhook authenticity, defense in depth**: (a) our token/secret in the callback URL path or query; (b) **Exotel IP allowlist** at Nginx once deployed — Exotel publishes egress IPs (verify the current list in their docs); (c) if your account offers webhook **signature verification**, enable and verify it — availability varies, check current docs. Anyone on the internet can POST to a public URL; an unverified StatusCallback means anyone can fabricate `call.completed` events.
- **PII discipline — never log full caller numbers**: a recruiter's phone number is personal data (doc 00 §12). Application logs mask to the last 4 digits (`+91••••••7842`); full numbers live only in the access-controlled database (Supabase RLS, doc 04/11).
- **Credential rotation**: `EXOTEL_API_TOKEN` is a full-power secret. Rotate immediately on any suspected leak (dashboard → regenerate), and calendar a routine rotation. Same for `VOICE_WS_AUTH_TOKEN` — rotating it means updating `.env` *and* the applet URL in the dashboard, in that order, during a no-call window.
- **Blast-radius**: the Exotel credentials never leave the API container's environment (doc 01 §12); they are read only inside `providers/exotel/` (doc 03 §12's `process.env` grep rule).

---

## 13. Checklist

- [ ] Exotel account created with the project email; email + phone verified
- [ ] KYC documents submitted (date noted); status tracked until approved
- [ ] Own mobile number verified in the dashboard (trial calling requirement)
- [ ] ExoPhone provisioned; number recorded in E.164 form
- [ ] Account SID, API Key, API Token, subdomain in the password manager
- [ ] Correct API cluster identified (`api.in.exotel.com` vs `api.exotel.com`) and proven by a 200 from the §7 curl
- [ ] `VOICE_WS_AUTH_TOKEN` generated via `openssl rand -hex 32` and stored
- [ ] ngrok installed, authtoken configured, `ngrok http 3000` understood
- [ ] `recruitpilot-voice` flow created in App Bazaar with Stage-1 greeting applet
- [ ] Flow **assigned to the ExoPhone** (not just created)
- [ ] Voicebot/Voice Streaming applet available — or support ticket raised to enable it
- [ ] StatusCallback pointed at webhook.site; test call made; POST payload inspected and saved as a future fixture
- [ ] All six env vars added to `.env` (git-ignored) and `.env.example` (placeholders)
- [ ] Self-quiz (§9.6) passed; understood that Twilio formats do NOT transfer 1:1

---

## 14. Next Step

Proceed to **`06_DEEPGRAM_SETUP.md`** — the ears of the assistant: Deepgram account and API key, choosing the streaming model and language settings for Indian-accented English, endpointing configuration (the 300ms slice of our latency budget), and a verified live-transcription test — so that when Exotel's audio starts flowing in doc 17, the STT side is already proven.
