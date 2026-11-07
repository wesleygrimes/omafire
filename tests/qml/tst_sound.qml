import QtQuick
import QtTest
import "../../ui/fire"

Item {
    width: 420
    height: 420
    FireState { id: fire; autoTick: false }
    FirePopup { id: popup; fire: fire; running: false }

    // Exercise playback decisions without sending test audio to the speakers.
    Component {
        id: silentAudio
        QtObject {
            property bool playing: false
            property bool failed: false
            property real heat: 0
            property real boost: 0
            function stopNow() { playing = false; }
        }
    }

    TestCase {
        name: "sound"
        when: windowShown

        function init() {
            fire.audioObject = silentAudio.createObject(fire);
            fire.open = false;
        }

        function cleanup() { fire.shutdown(); }

        function test_cycle_and_popup_visibility() {
            verify(!fire.sound);
            compare(popup.soundButton.text, "Sound off");
            fire.toggleSound();
            verify(fire.sound);
            compare(popup.soundButton.text, "Sound on");
            verify(!fire.audioObject.playing, "ordinary sound pauses while closed");
            fire.open = true;
            verify(fire.audioObject.playing);
            fire.open = false;
            verify(!fire.audioObject.playing);

            fire.toggleSound();
            compare(popup.soundButton.text, "Always on");
            verify(fire.sound);
            verify(fire.audioObject.playing, "always-on sound starts even while closed");
            fire.open = true;
            fire.open = false;
            verify(fire.audioObject.playing, "closing the popup keeps always-on sound playing");
            compare(JSON.parse(fire.statusJson()).soundMode, 2);

            fire.toggleSound();
            verify(!fire.sound);
            verify(!fire.audioObject.playing);
            compare(popup.soundButton.text, "Sound off");
        }

        function test_shutdown_stops_always_on() {
            fire.toggleSound();
            fire.toggleSound();
            verify(fire.audioObject.playing);
            fire.shutdown();
            verify(!fire.sound);
            verify(!fire.audioPlaying);
            compare(fire.audioObject, null);
        }

        function test_keyboard_cycles_modes() {
            popup.forceActiveFocus();
            keyClick(Qt.Key_M);
            compare(fire.soundMode, 1);
            keyClick(Qt.Key_M);
            compare(fire.soundMode, 2);
            keyClick(Qt.Key_M);
            compare(fire.soundMode, 0);
        }
    }
}
