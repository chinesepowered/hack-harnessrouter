# Demo assets

- **`sentinel-pitch-v2.mp4`** (recommended): the 1:36 pitch video. A cinematic cold open (Wan 3.0 Prime)
  match-cuts into real screen recordings of a live repo audit, then the HarnessRouter and business beats.
  Narration and shots are in [`script-v2.md`](script-v2.md).
- **`sentinel-demo.mp4`**: the narrated demo, also [on YouTube](https://www.youtube.com/watch?v=wMiJcJywn8Q) (about 2 minutes, 1080p,
  captions burned in). Pitch
  cards plus real screen recordings of the product: paste a GitHub repo, watch the agent's live
  tool calls, explore the graded report and the agent's full HTML report, then ask the same agent
  for the fixed code.
- **`sentinel-ui-walkthrough.mp4`**: the raw, silent screen recordings of the same UI, uncut and
  at real speed.
- **`sentinel-trailer.mp4`**: a 30-second cyberpunk trailer (1080p, with sound). Three 10-second shots
  generated with Wan 3.0 Prime via TokenRouter, cut together with title cards: an engineer under
  attack asks Claude for help and is refused, switches to Sentinel, and Sentinel defends his systems.
- **`thumbnail.jpg`**: the video thumbnail (1280x720), also used in the main README.
- **`script.md`**: the narration script, scene by scene.

Voiceover is ElevenLabs voice "Jessica" (not a sponsor; used for the voiceover and music bed only).
Everything shown in the UI is produced by the app in this repo talking to HarnessRouter: live
`qwen3.8-max` runs on the public `we45/Vulnerable-Flask-App` repository and on a pasted invoice API.
