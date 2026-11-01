import QtQuick
import QtQuick.Window
import "fire.js" as Fire

// The bar's tiny pixel fire: 12 x 12 cells in the scene's palette, drawn
// from the same fuel, heat and boost. It flickers at 5 fps and settles to a
// cold log when the fire rests.
//
// Same fractional-scale gap as the scene: the texture is shown at
// windowDpr/screenDpr of this box. The canvas is enlarged from the top-left
// and this item clips it back to 12 x 12.
Item {
    id: root

    property QtObject fire: null
    property bool animate: true
    property alias t: canvas.t
    property alias lastKey: canvas.lastKey
    function requestPaint() { canvas.requestPaint(); }
    onFireChanged: canvas.requestPaint()

    readonly property real screenDpr: Screen.devicePixelRatio > 0 ? Screen.devicePixelRatio : 1
    readonly property real windowDpr: {
        var win = canvas.Window.window;
        return win && win.devicePixelRatio > 0 ? win.devicePixelRatio : screenDpr;
    }
    readonly property real bufferCover: (screenDpr > 0 && windowDpr > 0 && Math.abs(screenDpr - windowDpr) >= 0.02) ? screenDpr / windowDpr : 1

    width: Fire.ICON_SIZE
    height: Fire.ICON_SIZE
    clip: true

    Canvas {
        id: canvas
        width: Fire.ICON_SIZE
        height: Fire.ICON_SIZE
        smooth: false
        antialiasing: false
        transform: Scale { origin.x: 0; origin.y: 0; xScale: root.bufferCover; yScale: root.bufferCover }

        property real t: 0
        property string lastKey: ""

        onPaint: {
            var ctx = getContext("2d");
            var heat = root.fire ? root.fire.heat : 0, boost = root.fire ? root.fire.boost : 0, fuel = root.fire ? root.fire.fuel : 0;
            var cells = Fire.iconCells(heat, boost, fuel, t);
            var key = cells.join("");
            if (key === lastKey) return;
            lastKey = key;
            ctx.clearRect(0, 0, width, height);
            for (var i = 0; i < cells.length; i++) {
                if (!cells[i]) continue;
                ctx.fillStyle = Fire.ICON_COLORS[cells[i]];
                ctx.fillRect(i % Fire.ICON_SIZE, Math.floor(i / Fire.ICON_SIZE), 1, 1);
            }
        }

        Timer {
            interval: 200
            repeat: true
            running: root.animate && root.visible && !!root.fire && (root.fire.heat > 0.02 || root.fire.fuel > 0.01)
            onTriggered: { canvas.t += 0.2; canvas.requestPaint(); }
        }
        Connections {
            target: root.fire
            function onStatusKeyChanged() { canvas.requestPaint(); }
        }
    }
}
