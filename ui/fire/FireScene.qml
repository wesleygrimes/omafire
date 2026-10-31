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
        // What the canvas currently shows; alpha 0 marks "unknown" so every
        // pixel is written again after a reset.
        property var shown: new Uint8ClampedArray(Fire.W * Fire.H * 4)
        property var lastTiles: null
        property bool dirtyAll: true
        property int frames: 0

        // Changed pixels go up in 24 x 24 tiles (fire.js flags the ones each
        // frame touches), each with its own cached image, and only pixels that
        // differ from what is shown are written. Qt 6.12's putImageData
        // misplaces a dirty sub-rectangle (it crops, then offsets by the dirty
        // origin again), so every put is a whole tile at its own position.
        property var tileImages: []

        function tileImage(ctx, index) {
            var img = tileImages[index];
            if (!img) {
                img = ctx.createImageData(Fire.TILE, Fire.TILE);
                // Qt keeps pixels premultiplied: set alpha before colour.
                var d = img.data;
                for (var a = 3; a < d.length; a += 4) d[a] = 255;
                tileImages[index] = img;
            }
            return img;
        }

        function putTile(ctx, index) {
            var T = Fire.TILE, W = Fire.W;
            var tx = index % Fire.TILE_COLS, ty = (index - tx) / Fire.TILE_COLS;
            var img = tileImage(ctx, index);
            var d = img.data, f = fb, s = shown, x0 = tx * T, y0 = ty * T, j = 0, changed = false;
            for (var y = y0; y < y0 + T; y++) {
                for (var i = (y * W + x0) * 4, e = i + T * 4; i < e; i += 4, j += 4) {
                    if (s[i + 3] === 0 || f[i] !== s[i] || f[i + 1] !== s[i + 1] || f[i + 2] !== s[i + 2]) {
                        d[j] = f[i]; d[j + 1] = f[i + 1]; d[j + 2] = f[i + 2];
                        s[i] = f[i]; s[i + 1] = f[i + 1]; s[i + 2] = f[i + 2]; s[i + 3] = 255;
                        changed = true;
                    }
                }
            }
            if (changed) ctx.putImageData(img, x0, y0, 0, 0, T, T);
        }

        onPaint: {
            if (!bg) return;
            var ctx = getContext("2d");
            var tiles = Fire.render(fb, root.fire.sim, bg);
            if (dirtyAll) shown.fill(0);
            for (var k = 0; k < tiles.length; k++) {
                if (dirtyAll || tiles[k] || (lastTiles && lastTiles[k])) putTile(ctx, k);
            }
            lastTiles = tiles;
            dirtyAll = false;
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
