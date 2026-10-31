import QtQuick
import QtQuick.Window
import QtTest
import "../../ui/fire"

// The bar icon in each fire state, grabbed to tests/out/icon-<state>-<dpr>x.png.
Item {
    id: host
    width: 120
    height: 40

    FireState { id: fireState; autoTick: false }

    Row {
        spacing: 8
        Repeater {
            id: icons
            model: 4
            Rectangle {
                width: 24; height: 24
                color: "#101213"
                property alias icon: ic
                FireIcon { id: ic; anchors.centerIn: parent; fire: fireState; animate: false }
            }
        }
    }

    TestCase {
        id: tc
        name: "icon"
        when: windowShown

        function grab(item, name) {
            var done = false;
            item.grabToImage(function (r) { r.saveToFile(Qt.resolvedUrl("../out/" + name).toString().replace(/^file:\/\//, "")); done = true; });
            tryVerify(function () { return done; }, 3000);
        }

        function test_states() {
            var states = [
                ["steady", 0.68, 0.68, 0],
                ["stoked", 1, 0.95, 1.1],
                ["embers", 0.02, 0.05, 0],
                ["resting", 0, 0, 0]
            ];
            compare(icons.itemAt(0).icon.width, 12);
            compare(icons.itemAt(0).icon.height, 12);
            for (var i = 0; i < states.length; i++) {
                fireState.sim.fuel = states[i][1]; fireState.sim.heat = states[i][2]; fireState.sim.boost = states[i][3];
                fireState.advance(0.0001, false);
                var ic = icons.itemAt(i).icon;
                ic.t = 1.3;
                ic.lastKey = "";
                ic.requestPaint();
                wait(50);
                grab(icons.itemAt(i), "icon-" + states[i][0] + "-" + Screen.devicePixelRatio + "x.png");            }
        }
    }
}
