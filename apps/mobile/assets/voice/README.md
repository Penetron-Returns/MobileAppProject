# Hey Clovie classifier

Drop the trained `hey_clovie.onnx` here (see docs/voice.md, "Training Hey Clovie") and rebuild
the Android dev client. `plugins/with-clovie-voice.js` copies it into the app and switches the
wake phrase from the bundled demo ("Hey LiveKit") to "Hey Clovie". Without it, the demo
classifier `hey_livekit.onnx` is used.
