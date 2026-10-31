import QtQuick
import QtQuick.Window
import QtTest
import "../../ui/fire"
import "../../ui/fire/fire.js" as Fire

// The scene's surface comes and goes under it: the popup window is hidden on
// every close (Qt tears down its scene graph, and the Canvas loses its 2D
// context and backing image with it), the shell rebuilds the popup on plugin
// reload while the shared fire lives on, and an item can move to another
// window. Each case grabs the scene afterwards; tests/qml.test.js compares
// every canvas pixel with fire.js at the same state, so a canvas that only
// redrew the parts that animate (and left the rest of the art dark) fails.
Item {
    id: host
    width: 64
    height: 64

    FireState {
        id: theFire
        autoTick: false
        open: true
    }

    Window {
        id: winA
        width: 400
        height: 270
        visible: true
        color: "#000000"
        Item { id: slotA; anchors.fill: parent }
    }

    Window {
        id: winB
        width: 400
        height: 270
        visible: false
        color: "#000000"
        Item { id: slotB; anchors.fill: parent }
    }

    Component {
        id: sceneComponent
        FireScene { width: 388; height: 259; fire: theFire }
    }

    property var scene: null

    function outPath(name) {
        return Qt.resolvedUrl("../out/" + name).toString().replace(/^file:\/\//, "");
    }

    // Deterministic state: `steps` steps of 1/60 s from the seed, the same as
    // tests/qml.test.js renders with fire.js.
    function resetTo(steps) {
        theFire.sim = Fire.createState();
        for (var i = 0; i < steps; i++) theFire.advance(1 / 60, true);
    }

    function nextFrame() {
        var n = scene.framesDrawn;
        tc.tryVerify(function () { return scene.framesDrawn > n; }, 5000, "scene repainted");
    }

    // Plays the fire up to `steps` over several painted frames, so the frame
    // that is grabbed was built incrementally on top of the earlier ones
    // (and checks that the last few really were incremental, not full).
    function playTo(steps) {
        resetTo(steps - 24);
        nextFrame();
        var fullBefore = -1;
        for (var k = 0; k < 8; k++) {
            for (var i = 0; i < 3; i++) theFire.advance(1 / 60, true);
            nextFrame();
            if (k === 3) fullBefore = scene.fullFramesDrawn;
        }
        tc.compare(scene.fullFramesDrawn, fullBefore, "the last frames copied only what changed");
        tc.wait(50);
    }

    function grab(name) {
        var done = false;
        scene.grabToImage(function (result) { result.saveToFile(outPath(name)); done = true; });
        tc.tryVerify(function () { return done; }, 5000, "grab " + name);
    }

    function makeScene(parentItem, decodeAgain) {
        scene = sceneComponent.createObject(parentItem, { reuseArt: !decodeAgain });
        tc.tryVerify(function () { return scene.ready; }, 10000, "background decoded");
    }

    TestCase {
        id: tc
        name: "lifecycle"
        when: windowShown

        function initTestCase() {
            tryVerify(function () { return winA.visible && winA.width > 0; }, 5000);
            makeScene(slotA);
        }

        function test_1_first_open() {
            playTo(238);
            grab("life-first-" + Screen.devicePixelRatio + "x.png");
        }

        // The popup closes (the window unmaps) and opens again.
        function test_2_hide_and_show() {
            nextFrame();
            nextFrame();
            winA.visible = false;
            wait(150);
            resetTo(250);
            wait(150);
            winA.visible = true;
            tryVerify(function () { return winA.visible; });
            playTo(250);
            grab("life-reshow-" + Screen.devicePixelRatio + "x.png");
        }

        // Hidden and shown twice more, with the scene painting while hidden.
        function test_3_hide_show_repeated() {
            for (var k = 0; k < 2; k++) {
                winA.visible = false;
                scene.running = true;
                wait(120);
                winA.visible = true;
                wait(120);
            }
            playTo(262);
            grab("life-reshow2-" + Screen.devicePixelRatio + "x.png");
        }

        // The scene moves to another window (another output's bar).
        function test_4_other_window() {
            winB.visible = true;
            tryVerify(function () { return winB.visible; });
            scene.parent = slotB;
            playTo(274);
            grab("life-moved-" + Screen.devicePixelRatio + "x.png");
            scene.parent = slotA;
            winB.visible = false;
        }

        // Plugin reload: the popup (and its canvas) is destroyed and built
        // again around the same fire.
        function test_5_rebuilt() {
            scene.destroy();
            wait(50);
            makeScene(slotA);
            playTo(286);
            grab("life-rebuilt-" + Screen.devicePixelRatio + "x.png");
        }

        // Rebuilt with the art decoded again: it arrives after the canvas
        // has started painting.
        function test_5b_rebuilt_decoding() {
            scene.destroy();
            wait(50);
            makeScene(slotA, true);
            playTo(292);
            grab("life-redecoded-" + Screen.devicePixelRatio + "x.png");
        }

        // Rebuilt (and decoding) while its window is hidden, then shown.
        function test_6_rebuilt_hidden() {
            winA.visible = false;
            scene.destroy();
            wait(50);
            scene = sceneComponent.createObject(slotA, { reuseArt: false });
            wait(200);
            winA.visible = true;
            tryVerify(function () { return scene.ready; }, 10000, "background decoded");
            playTo(298);
            grab("life-rebuilt-hidden-" + Screen.devicePixelRatio + "x.png");
        }

        // The scene graph is released under a shown window.
        function test_7_release_resources() {
            winA.releaseResources();
            wait(100);
            winA.visible = false;
            wait(50);
            winA.visible = true;
            playTo(310);
            grab("life-released-" + Screen.devicePixelRatio + "x.png");
        }
    }
}
