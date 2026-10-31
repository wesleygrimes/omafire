import QtQuick
import QtQuick.Window
import "fire.js" as Fire

// The 360 x 240 scene. fire.js composites each frame into a framebuffer; the
// canvas copies only the changed box into its image and the item is scaled
// to the panel width with nearest sampling, so pixels stay crisp at any
// output scale. Pointer positions map back into 360 x 240.
Item {
    id: root

    required property QtObject fire
    // Draw only while this is true (the popup is open and shown).
    property bool running: true
    property string fontFamily: "monospace"
    readonly property bool ready: canvas.bg !== null
    readonly property int framesDrawn: canvas.frames

    implicitWidth: 388
    implicitHeight: Math.round(width * 2 / 3)
    clip: true

    // A Canvas backs itself with an image at its size times the output's
    // device pixel ratio. In Qt 6.12 putImageData draws through that scale
    // (one image pixel covers dpr x dpr device pixels, unfiltered), but
    // getImageData reads raw device pixels. So the scene canvas stays at
    // 360 x 240 logical, and the decoder canvas is sized in device pixels
    // (720 x 480 divided by the ratio) and draws the art unscaled, so
    // getImageData returns it 1:1 (checked against ImageMagick's decode).
    readonly property real dpr: Screen.devicePixelRatio > 0 ? Screen.devicePixelRatio : 1

    // Decodes the approved art once at its own 720 x 480 size; fire.js
    // samples it down to 360 x 240 exactly like the reference drawImage.
    Loader {
        id: decoder
        active: canvas.bg === null
        visible: false
        sourceComponent: Canvas {
            id: decodeCanvas
            readonly property url art: Qt.resolvedUrl("../../assets/campsite-approved.webp")
            width: 720 / root.dpr
            height: 480 / root.dpr
            visible: false
            Component.onCompleted: loadImage(art)
            onImageLoaded: requestPaint()
            onPaint: {
                if (!isImageLoaded(art)) return;
                var ctx = getContext("2d");
                // Undo the device scale so the art lands 1:1 in device
                // pixels with no resampling (a scaled drawImage filters).
                ctx.save();
                ctx.scale(1 / root.dpr, 1 / root.dpr);
                ctx.drawImage(art, 0, 0);
                ctx.restore();
                var px = ctx.getImageData(0, 0, 720, 480).data;
                var src = new Uint8ClampedArray(720 * 480 * 4);
                for (var i = 0; i < src.length; i++) src[i] = px[i];
                canvas.bg = Fire.prepareBackground(src, 720, 480);
                canvas.dirtyAll = true;
                canvas.requestPaint();
            }
        }
    }

    Canvas {
        id: canvas
        width: Fire.W
        height: Fire.H
        smooth: false
        antialiasing: false
        transform: Scale { xScale: root.width / Fire.W; yScale: root.height / Fire.H }
        // Another output's scale means a new, empty backing image.
        Connections {
            target: root
            function onDprChanged() { canvas.dirtyAll = true; canvas.requestPaint(); }
        }

        property var bg: null
        property var fb: Fire.createFrame()
        property var lastBox: null
        property bool dirtyAll: true
        property int frames: 0

        // Changed pixels go up in 24 x 24 tiles, each with its own cached
        // image. Qt 6.12's putImageData misplaces a dirty sub-rectangle (it
        // crops, then offsets by the dirty origin again), so every put here
        // is a whole tile image at its own position with a 0,0 origin.
        readonly property int tile: 24
        property var tiles: []

        function tileImage(ctx, index) {
            var img = tiles[index];
            if (!img) {
                img = ctx.createImageData(tile, tile);
                // Qt keeps pixels premultiplied: set alpha before colour.
                var d = img.data;
                for (var a = 3; a < d.length; a += 4) d[a] = 255;
                tiles[index] = img;
            }
            return img;
        }

        function putTile(ctx, tx, ty) {
            var cols = Fire.W / tile;
            var img = tileImage(ctx, ty * cols + tx);
            var d = img.data, f = fb, W = Fire.W, x0 = tx * tile, y0 = ty * tile, j = 0;
            for (var y = y0; y < y0 + tile; y++) {
                for (var i = (y * W + x0) * 4, e = i + tile * 4; i < e; i += 4, j += 4) {
                    d[j] = f[i]; d[j + 1] = f[i + 1]; d[j + 2] = f[i + 2];
                }
            }
            ctx.putImageData(img, x0, y0, 0, 0, tile, tile);
        }

        onPaint: {
            if (!bg) return;
            var ctx = getContext("2d");
            var box = Fire.render(fb, root.fire.sim, bg);
            var u = dirtyAll ? [0, 0, Fire.W, Fire.H] : Fire.unionBox(box, lastBox);
            lastBox = box;
            dirtyAll = false;
            var cols = Fire.W / tile, done = {}, tx, ty;
            if (u) {
                for (ty = Math.floor(u[1] / tile); ty * tile < u[3]; ty++)
                    for (tx = Math.floor(u[0] / tile); tx * tile < u[2]; tx++) {
                        putTile(ctx, tx, ty);
                        done[ty * cols + tx] = true;
                    }
            }
            var stars = Fire.starPixels(root.fire.sim);
            for (var k = 0; k < stars.length; k++) {
                var p = stars[k] / 4;
                tx = Math.floor((p % Fire.W) / tile);
                ty = Math.floor(Math.floor(p / Fire.W) / tile);
                if (done[ty * cols + tx]) continue;
                putTile(ctx, tx, ty);
                done[ty * cols + tx] = true;
            }
            frames++;
        }
    }

    // 20 fps like the reference's 50 ms gate; about 5.5 fps with reduced motion.
    Timer {
        interval: root.fire.reducedMotion ? 180 : 50
        repeat: true
        running: root.running && root.visible && canvas.bg !== null
        onTriggered: canvas.requestPaint()
    }
    onRunningChanged: if (running) canvas.requestPaint()

    MouseArea {
        id: pointer
        anchors.fill: parent
        hoverEnabled: true
        preventStealing: true
        acceptedButtons: Qt.LeftButton
        property string cursorName: "default"
        cursorShape: cursorName === "grabbing" ? Qt.ClosedHandCursor : cursorName === "grab" ? Qt.OpenHandCursor : Qt.ArrowCursor

        function sx(x) { return x * Fire.W / root.width; }
        function sy(y) { return y * Fire.H / root.height; }

        onPressed: function (mouse) {
            root.fire.pointerDown(sx(mouse.x), sy(mouse.y));
            cursorName = root.fire.cursorFor(sx(mouse.x), sy(mouse.y));
        }
        onPositionChanged: function (mouse) {
            if (root.fire.dragging) root.fire.pointerMove(sx(mouse.x), sy(mouse.y));
            cursorName = root.fire.cursorFor(sx(mouse.x), sy(mouse.y));
        }
        onReleased: function (mouse) {
            root.fire.pointerUp(sx(mouse.x), sy(mouse.y));
            cursorName = root.fire.cursorFor(sx(mouse.x), sy(mouse.y));
        }
        onCanceled: { root.fire.pointerCancel(); cursorName = "default"; }
    }

    // Toast: top of the artwork, 12 px inset, centred, one line; fades .3 s.
    Rectangle {
        id: toast
        anchors.horizontalCenter: parent.horizontalCenter
        y: 12
        width: toastLabel.implicitWidth + 18 + 2
        height: 28
        color: "#e8101213"
        border.width: 1
        border.color: "#66604c"
        opacity: root.fire.toastVisible ? 1 : 0
        visible: opacity > 0
        Behavior on opacity { enabled: !root.fire.reducedMotion; NumberAnimation { duration: 300 } }
        Text {
            id: toastLabel
            anchors.centerIn: parent
            text: root.fire.toastText
            color: "#efd1a0"
            font.family: root.fontFamily
            font.pixelSize: 12
        }
    }
}
