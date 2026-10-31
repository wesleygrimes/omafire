import QtQuick
import QtMultimedia

// The crackle loop. Only FireState creates this, on the first Sound press, so
// a shell without QtMultimedia still loads the rest of OmaFire.
//
// MediaPlayer rather than SoundEffect: SoundEffect plays only formats the
// output device takes natively (PipeWire refused the 22.05 kHz mono loop),
// while MediaPlayer's FFmpeg backend resamples.
//
// Gains follow the reference toggleSound(): master 0.22 with the noise and
// crackle layers at 0.1 + heat * 0.55 and 0.1 + heat * 0.65. The bundled loop
// was mixed at heat 0.68, so the heat factor here is relative to that mix.
QtObject {
    id: root

    property real heat: 0.68
    property bool playing: false
    // No output device counts as unavailable, so the user hears about it.
    readonly property bool failed: player.error !== MediaPlayer.NoError || devices.audioOutputs.length === 0
    property MediaDevices devices: MediaDevices {}

    readonly property real mixAtBake: 0.1 + 0.68 * 0.6
    readonly property real target: playing ? 0.22 * (0.1 + heat * 0.6) / mixAtBake : 0

    // Fades like the reference's setTargetAtTime: about .3 s.
    property real level: 0
    Behavior on level { NumberAnimation { duration: 300; easing.type: Easing.OutQuad } }

    onTargetChanged: level = target
    onPlayingChanged: {
        if (playing && player.playbackState !== MediaPlayer.PlayingState) player.play();
        level = target;
    }
    onLevelChanged: {
        output.volume = Math.max(0, Math.min(1, level));
        if (!playing && level <= 0.0001 && player.playbackState === MediaPlayer.PlayingState) player.stop();
    }

    function stopNow() {
        playing = false;
        output.volume = 0;
        player.stop();
    }

    property AudioOutput output: AudioOutput { volume: 0 }
    property MediaPlayer player: MediaPlayer {
        // No device, no decoding.
        source: root.devices.audioOutputs.length > 0 ? Qt.resolvedUrl("../../assets/crackle.wav") : ""
        loops: MediaPlayer.Infinite
        audioOutput: root.output
    }

    Component.onDestruction: player.stop()
}
