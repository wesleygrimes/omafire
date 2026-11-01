import QtQuick
import QtMultimedia
import "night.js" as Night
import "sound.js" as Sound

// The fire's sound. Only FireState creates this, on the first Sound press, so
// a shell without QtMultimedia still loads the rest of OmaFire.
//
// MediaPlayer rather than SoundEffect: SoundEffect plays only formats the
// output device takes natively (PipeWire refused the 22.05 kHz mono loop),
// while MediaPlayer's FFmpeg backend resamples.
//
// Three loops of different lengths play together the whole time sound is on,
// and heat decides how loud each one is (sound.js): embers for a low fire,
// crackle for a steady one, roar for a hot or stoked one. Adding a log or
// stoking plays its own one-shot on top. scripts/gen-fire.py makes the files.
QtObject {
    id: root

    property real heat: 0.68
    property real boost: 0
    property bool playing: false
    readonly property bool hasDevice: devices.audioOutputs.length > 0
    // No output device counts as unavailable, so the user hears about it.
    readonly property bool failed: !hasDevice
        || embers.error !== MediaPlayer.NoError
        || crackle.error !== MediaPlayer.NoError
        || roar.error !== MediaPlayer.NoError
    property MediaDevices devices: MediaDevices {}

    // The loops are mixed so that a fire at the default heat (0.68) plays
    // about as loud as the old single crackle loop did.
    readonly property real master: 0.5
    readonly property real eventLevel: 0.2

    // Each layer eases to its heat level, so a stoke swells instead of jumping.
    property real embersLevel: master * Sound.embersGain(heat)
    property real crackleLevel: master * Sound.crackleGain(heat)
    property real roarLevel: master * Sound.roarGain(heat, boost)
    Behavior on embersLevel { NumberAnimation { duration: 600; easing.type: Easing.InOutQuad } }
    Behavior on crackleLevel { NumberAnimation { duration: 600; easing.type: Easing.InOutQuad } }
    Behavior on roarLevel { NumberAnimation { duration: 600; easing.type: Easing.InOutQuad } }

    // Sound on and off fades everything over about .3 s.
    property real fade: 0
    Behavior on fade { NumberAnimation { duration: 300; easing.type: Easing.OutQuad } }

    function clamp(v) { return Math.max(0, Math.min(1, v)); }
    function applyLevels() {
        embersOut.volume = clamp(embersLevel * fade);
        crackleOut.volume = clamp(crackleLevel * fade);
        roarOut.volume = clamp(roarLevel * fade);
    }
    onEmbersLevelChanged: applyLevels()
    onCrackleLevelChanged: applyLevels()
    onRoarLevelChanged: applyLevels()
    onFadeChanged: {
        applyLevels();
        if (!playing && fade <= 0.0001) stopLoops();
    }

    onPlayingChanged: {
        if (playing) {
            ambience = Night.createAmbience(5919);
            if (embers.playbackState !== MediaPlayer.PlayingState) embers.play();
            if (crackle.playbackState !== MediaPlayer.PlayingState) crackle.play();
            if (roar.playbackState !== MediaPlayer.PlayingState) roar.play();
            fade = 1;
        } else {
            fade = 0;
            stopOneShots();
        }
    }

    function stopLoops() {
        embers.stop();
        crackle.stop();
        roar.stop();
    }

    function stopOneShots() {
        logClip.stop();
        stokeClip.stop();
        cricket.stop();
        peep.stop();
        croak.stop();
    }

    function stopNow() {
        playing = false;
        fade = 0;
        embersOut.volume = 0;
        crackleOut.volume = 0;
        roarOut.volume = 0;
        cricketOut.volume = 0;
        peepOut.volume = 0;
        croakOut.volume = 0;
        stopLoops();
        stopOneShots();
    }

    function restart(clip) {
        if (clip.playbackState === MediaPlayer.PlayingState) clip.stop();
        clip.position = 0;
        clip.play();
    }

    // A log landing (button, key, or drag) and a stoke. Nothing while sound
    // is off, so turning it on later doesn't replay old events.
    function playLog() {
        if (!playing || !hasDevice) return;
        logOut.volume = eventLevel;
        restart(logClip);
    }
    function playStoke() {
        if (!playing || !hasDevice) return;
        stokeOut.volume = eventLevel;
        restart(stokeClip);
    }

    // Gains are the clip's own level times how far off that animal is. The
    // fire sits near 0.04 effective; these stay under it, and each call has
    // its own small reverb, so they read as off in the trees.
    function playNight(ev) {
        var base = ev.kind === "cricket" ? 0.055 : ev.kind === "croak" ? 0.048 : 0.042;
        var vol = Math.max(0, Math.min(0.12, base * ev.gain));
        var clip = ev.kind === "cricket" ? cricket : ev.kind === "croak" ? croak : peep;
        var out = ev.kind === "cricket" ? cricketOut : ev.kind === "croak" ? croakOut : peepOut;
        out.volume = vol;
        restart(clip);
    }

    property var ambience: Night.createAmbience(5919)

    // No device, no decoding: every source stays empty without an output.
    function asset(name) { return hasDevice ? Qt.resolvedUrl("../../assets/" + name) : ""; }

    property AudioOutput embersOut: AudioOutput { volume: 0 }
    property AudioOutput crackleOut: AudioOutput { volume: 0 }
    property AudioOutput roarOut: AudioOutput { volume: 0 }
    property MediaPlayer embers: MediaPlayer {
        source: root.asset("fire-embers.wav")
        loops: MediaPlayer.Infinite
        audioOutput: root.embersOut
    }
    property MediaPlayer crackle: MediaPlayer {
        source: root.asset("fire-crackle.wav")
        loops: MediaPlayer.Infinite
        audioOutput: root.crackleOut
    }
    property MediaPlayer roar: MediaPlayer {
        source: root.asset("fire-roar.wav")
        loops: MediaPlayer.Infinite
        audioOutput: root.roarOut
    }

    property AudioOutput logOut: AudioOutput { volume: 0 }
    property AudioOutput stokeOut: AudioOutput { volume: 0 }
    property MediaPlayer logClip: MediaPlayer {
        source: root.asset("fire-log.wav")
        audioOutput: root.logOut
    }
    property MediaPlayer stokeClip: MediaPlayer {
        source: root.asset("fire-stoke.wav")
        audioOutput: root.stokeOut
    }

    property AudioOutput cricketOut: AudioOutput { volume: 0 }
    property AudioOutput peepOut: AudioOutput { volume: 0 }
    property AudioOutput croakOut: AudioOutput { volume: 0 }
    property MediaPlayer cricket: MediaPlayer {
        source: root.asset("cricket.wav")
        audioOutput: root.cricketOut
    }
    property MediaPlayer peep: MediaPlayer {
        source: root.asset("peep.wav")
        audioOutput: root.peepOut
    }
    property MediaPlayer croak: MediaPlayer {
        source: root.asset("croak.wav")
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
        stopLoops();
        stopOneShots();
    }
}
