import QtQuick
import "fire.js" as Fire

// The bar's tiny pixel fire: 12 x 12 cells in the scene's palette, drawn
// from the same fuel, heat and boost. It flickers at 5 fps and settles to a
// cold log when the fire rests.
Canvas {
    id: root

    property QtObject fire: null
    property bool animate: true
    property real t: 0
    property string lastKey: ""

    width: Fire.ICON_SIZE
    height: Fire.ICON_SIZE
    smooth: false
    antialiasing: false

    onPaint: {
        var ctx = getContext("2d");
        var heat = fire ? fire.heat : 0, boost = fire ? fire.boost : 0, fuel = fire ? fire.fuel : 0;
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
        onTriggered: { root.t += 0.2; root.requestPaint(); }
    }
    Connections {
        target: root.fire
        function onStatusKeyChanged() { root.requestPaint(); }
    }
    onFireChanged: requestPaint()
}
