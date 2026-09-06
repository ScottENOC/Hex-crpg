# iOS audio conversion target

The current GarageBand WAV exports are lossless PCM and much larger than needed for shipped mobile audio.

Recommended delivery formats:

- Music: AAC-LC in `.m4a`, 128–160 kbps stereo.
- Dialogue: AAC-LC in `.m4a`, 80–96 kbps mono where the recording is mono/voice-only.
- Short effects/stings: AAC-LC in `.m4a`, 96–128 kbps; keep WAV only when truly tiny and latency-critical.

Do not delete the WAV sources until the converted build has been tested. Once `.m4a` files exist, update `audio.js` paths and any direct dialogue/effect paths, then remove the shipped WAV copies from the app bundle.

A batch ffmpeg equivalent is:

```bash
ffmpeg -i input.wav -c:a aac -b:a 144k output.m4a
```

The actual binary transcode is intentionally not committed here because the GitHub connector used for this optimisation pass can edit repository text but cannot retrieve binary WAV bytes for conversion.
