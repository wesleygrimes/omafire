import QtQuick
import QtQuick.Window
import QtTest
import "../../ui/fire"

// Standalone popup smoke test: real mouse and key events through the scene
// and the footer, geometry checks, and grabs into tests/out at the current
// device pixel ratio (run at QT_SCALE_FACTOR=1 and 2 by tests/qml.test.js).
Item {
    id: host
    width: 420
    height: 420

    FireState {
        id: fire
        autoTick: false
        open: true
    }

    FirePopup {
        id: popup
        x: 10
        y: 10
        fire: fire
    }

    SignalSpy { id: closeSpy; target: popup; signalName: "closeRequested" }

    function outPath(name) {
        return Qt.resolvedUrl("../out/" + name).toString().replace(/^file:\/\//, "");
    }

    function grab(item, name) {
        var done = false;
        item.grabToImage(function (result) { result.saveToFile(outPath(name)); done = true; });
        tc.tryVerify(function () { return done; }, 5000, "grab " + name);
    }

    function scenePoint(x, y) {
        return { x: x * popup.scene.width / 360, y: y * popup.scene.height / 240 };
    }

    function frames(seconds) {
        for (var i = 0; i < Math.round(seconds * 60); i++) fire.advance(1 / 60, true);
    }

    function settleFrame() {
        var n = popup.scene.framesDrawn;
        tc.tryVerify(function () { return popup.scene.framesDrawn > n + 1; }, 3000, "scene repainted");
    }

    TestCase {
        id: tc
        name: "popup"
        when: windowShown

        function test_1_geometry() {
            tryVerify(function () { return popup.scene.ready; }, 10000, "background decoded");
            compare(popup.width, 390, "popup is 390 logical px wide");
            compare(popup.scene.width, 388, "scene fills the interior");
            compare(popup.scene.height, 259, "scene is 3:2 (388 x 258.67 rounded)");
            verify(Math.abs(popup.scene.width / popup.scene.height - 1.5) < 0.005);
            compare(popup.height, 381, "popup height");
            compare(popup.addButton.height, 36);
            compare(popup.addButton.width, popup.soundButton.width, "equal buttons");
            compare(popup.soundButton.x - popup.stokeButton.x - popup.stokeButton.width, 8, "8 px gap");
            compare(popup.resizeGrip.width, 22, "the corner grip is there");
            compare(popup.resizeGrip.y + popup.resizeGrip.height, popup.height, "grip sits on the bottom");
            compare(fire.statusText, "● Burning steadily");
            compare(popup.soundButton.text, "Sound off");
        }

        function test_2_capture() {
            // Close to the approved capture's moment (about 4 s in).
            frames(3.967);
            settleFrame();
            var dpr = Screen.devicePixelRatio;
            grab(popup, "popup-" + dpr + "x.png");
        }

        function test_3_buttons() {
            var fuel = fire.fuel;
            mouseClick(popup.addButton);
            verify(Math.abs(fire.fuel - Math.min(1, fuel + 0.25)) < 1e-6, "add log adds 0.25 fuel");
            verify(fire.boost >= 0.35);
            compare(fire.toastText, "Fresh wood. Give it a moment.");
            verify(fire.toastVisible);
            frames(0.35);
            settleFrame();
            grab(popup, "popup-addlog-" + Screen.devicePixelRatio + "x.png");

            fuel = fire.fuel;
            mouseClick(popup.stokeButton);
            compare(fire.boost, 1.1);
            compare(fire.statusText, "● Stoking the fire");
            compare(fire.toastText, "The coals come alive.");
            compare(fire.fuel, fuel, "stoke adds no fuel");

            mouseClick(popup.soundButton);
            if (fire.audioAvailable) {
                verify(fire.sound);
                compare(popup.soundButton.text, "Sound on");
                mouseClick(popup.soundButton);
                verify(!fire.sound);
            } else {
                verify(!fire.sound);
                compare(fire.toastText, "Sound unavailable.");
            }
            compare(popup.soundButton.text, "Sound off");
        }

        function test_4_drag_to_hearth() {
            frames(2.5);
            var fuel = fire.fuel;
            var a = scenePoint(40, 170);
            mousePress(popup.scene, a.x, a.y);
            verify(fire.dragging, "drag starts on the woodpile");
            for (var i = 1; i <= 10; i++) {
                var p = scenePoint(40 + i * 13.6, 170 + i * 0.8);
                mouseMove(popup.scene, p.x, p.y);
                fire.advance(1 / 60, true);
            }
            settleFrame();
            grab(popup, "popup-drag-" + Screen.devicePixelRatio + "x.png");
            verify(fire.fuel < fuel, "dragging adds no fuel (it only burns)");
            fuel = fire.fuel;
            var h = scenePoint(176, 178);
            mouseRelease(popup.scene, h.x, h.y);
            verify(!fire.dragging);
            verify(Math.abs(fire.fuel - Math.min(1, fuel + 0.25)) < 1e-6, "dropped log adds fuel");
            compare(fire.boost, 0.45);
            compare(fire.toastText, "That’ll keep it going.");
        }

        function test_5_invalid_drop_and_poke() {
            frames(3);
            var fuel = fire.fuel;
            var a = scenePoint(30, 200), b = scenePoint(300, 40);
            mousePress(popup.scene, a.x, a.y);
            mouseMove(popup.scene, (a.x + b.x) / 2, (a.y + b.y) / 2);
            mouseMove(popup.scene, b.x, b.y);
            mouseRelease(popup.scene, b.x, b.y);
            verify(!fire.dragging);
            compare(fire.fuel, fuel, "invalid drop changes nothing");

            var c = scenePoint(181, 176);
            var sparks = fire.sim.sparks.length;
            mouseClick(popup.scene, c.x, c.y);
            verify(fire.sim.sparks.length >= Math.min(160, sparks + 32) - 0, "poke sparks");
            verify(fire.boost >= 0.22);
            compare(fire.fuel, fuel, "poke adds no fuel");
            compare(fire.toastText, "A little shower of sparks.");
        }

        function test_6_keyboard() {
            popup.forceActiveFocus();
            var fuel = fire.fuel;
            keyClick(Qt.Key_A);
            verify(fire.fuel > fuel, "A adds a log");
            keyClick(Qt.Key_S);
            compare(fire.boost, 1.1, "S stokes");
            keyClick(Qt.Key_Tab);
            verify(popup.keyboardFocusVisible);
            verify(popup.addButton.activeFocus, "Tab reaches the first button");
            keyClick(Qt.Key_Tab);
            verify(popup.stokeButton.activeFocus);
            grab(popup, "popup-focus-" + Screen.devicePixelRatio + "x.png");
            keyClick(Qt.Key_Escape);
            compare(closeSpy.count, 1, "Escape asks to close");
        }

        function test_7_exhausted_fire() {
            fire.sim.fuel = 0; fire.sim.heat = 0; fire.sim.boost = 0;
            fire.advance(1, false);
            compare(fire.statusText, "○ Resting");
            mouseClick(popup.stokeButton);
            compare(fire.toastText, "Add a log to get it going.");
            compare(fire.fuel, 0);
            var c = scenePoint(181, 176);
            mouseClick(popup.scene, c.x, c.y);
            compare(fire.fuel, 0, "poking does not rekindle");
            frames(2);
            compare(fire.statusText, "○ Resting");
            mouseClick(popup.addButton);
            frames(3);
            verify(fire.heat > 0.08, "wood rekindles it");
            settleFrame();
            grab(popup, "popup-rekindle-" + Screen.devicePixelRatio + "x.png");
        }

        function test_8_resized_panel() {
            popup.panelWidth = 520;
            compare(popup.width, 520, "width follows panelWidth");
            compare(popup.scene.width, 518);
            compare(popup.scene.height, 345, "scene stays 3:2");
            compare(popup.height, 467);
            compare(popup.resizeGrip.y + popup.resizeGrip.height, popup.height);
            popup.panelWidth = 390;
            compare(popup.width, 390, "back to the reference size");
            compare(popup.height, 381);
        }
    }
}
