import QtQuick
import QtMultimedia
import "night.js" as Night

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
        if (playing) ambience = Night.createAmbience(5919);
        if (playing && player.playbackState !== MediaPlayer.PlayingState) player.play();
        level = target;
        if (!playing) {
            cricket.stop();
            peep.stop();
            croak.stop();
        }
    }
    onLevelChanged: {
        output.volume = Math.max(0, Math.min(1, level));
        if (!playing && level <= 0.0001 && player.playbackState === MediaPlayer.PlayingState) player.stop();
    }

    function stopNow() {
        playing = false;
        output.volume = 0;
        player.stop();
        cricketOut.volume = 0;
        peepOut.volume = 0;
        croakOut.volume = 0;
        cricket.stop();
        peep.stop();
        croak.stop();
    }

    // Gains are the clip's own level times how far off that animal is.
    // The crackle sits near 0.22; these stay well under it, and the files
    // are already dull, so the calls read as across the water.
    function playNight(ev) {
        var base = ev.kind === "cricket" ? 0.055 : ev.kind === "croak" ? 0.048 : 0.042;
        var vol = Math.max(0, Math.min(0.12, base * ev.gain));
        var clip = ev.kind === "cricket" ? cricket : ev.kind === "croak" ? croak : peep;
        var out = ev.kind === "cricket" ? cricketOut : ev.kind === "croak" ? croakOut : peepOut;
        out.volume = vol;
        if (clip.playbackState === MediaPlayer.PlayingState) clip.stop();
        clip.position = 0;
        clip.play();
    }

    property var ambience: Night.createAmbience(5919)

    property AudioOutput output: AudioOutput { volume: 0 }
    property MediaPlayer player: MediaPlayer {
        // No device, no decoding.
        source: root.devices.audioOutputs.length > 0 ? Qt.resolvedUrl("../../assets/crackle.wav") : ""
        loops: MediaPlayer.Infinite
        audioOutput: root.output
    }

    property AudioOutput cricketOut: AudioOutput { volume: 0 }
    property AudioOutput peepOut: AudioOutput { volume: 0 }
    property AudioOutput croakOut: AudioOutput { volume: 0 }
    property MediaPlayer cricket: MediaPlayer {
        source: root.devices.audioOutputs.length > 0 ? Qt.resolvedUrl("../../assets/cricket.wav") : ""
        audioOutput: root.cricketOut
    }
    property MediaPlayer peep: MediaPlayer {
        source: root.devices.audioOutputs.length > 0 ? Qt.resolvedUrl("../../assets/peep.wav") : ""
        audioOutput: root.peepOut
    }
    property MediaPlayer croak: MediaPlayer {
        source: root.devices.audioOutputs.length > 0 ? Qt.resolvedUrl("../../assets/croak.wav") : ""
        audioOutput: root.croakOut
    }

    // A nested Timer is a child, and QtObject has no default property, so the
    // whole component failed to load and Sound never started. Keep it a property.
    property Timer nightClock: Timer {
        interval: 100
        repeat: true
        running: root.playing && !root.failed
        onTriggered: {
            var ev = Night.advanceAmbience(root.ambience, 0.1);
            for (var i = 0; i < ev.length; i++) root.playNight(ev[i]);
        }
    }

    Component.onDestruction: {
        player.stop();
        cricket.stop();
        peep.stop();
        croak.stop();
    }
}
