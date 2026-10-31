import QtQuick
import QtQuick.Window
import "fire.js" as Fire

// The 360 x 240 scene. fire.js composites each frame into a framebuffer; the
// canvas copies only what changed into its image and the item is scaled
// to the panel width with nearest sampling, so pixels stay crisp at any
// output scale. Pointer positions map back into 360 x 240.
Item {
    id: root

    required property QtObject fire
    // Draw only while this is true (the popup is open and shown).
    property bool running: true
    property string fontFamily: "monospace"
    // Start from the art an earlier scene decoded (tests turn this off to
    // exercise a decode that lands after the first paints).
    property bool reuseArt: true
    readonly property bool ready: canvas.bg !== null
    readonly property int framesDrawn: canvas.frames
    // Frames that copied the whole image (first paint, new surface).
    readonly property int fullFramesDrawn: canvas.fullFrames

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
    // Ask the window, not Screen: with fractional scaling Screen reports the
    // output's integer scale (2 at 1.33x) while the window really uses 1.33.
    readonly property real dpr: Window.window && Window.window.devicePixelRatio > 0
        ? Window.window.devicePixelRatio
        : (Screen.devicePixelRatio > 0 ? Screen.devicePixelRatio : 1)
    // A new layer-shell window passes through other ratios (2, then 1, then
    // 1.33) before it settles, so art decoded at a stale one is decoded again.
    property real decodedDpr: 0
    onDprChanged: if (decodedDpr > 0 && decodedDpr !== dpr) { decodedDpr = 0; canvas.bg = null; }

    // Decodes the approved art once at its own 720 x 480 size; fire.js
    // samples it down to 360 x 240 exactly like the reference drawImage.
    Loader {
        id: decoder
        // Wait for a window: the art is decoded once and cached, so a decode
        // at the wrong ratio would stick until the shell restarts.
        active: canvas.bg === null && !!root.Window.window
        visible: false
        sourceComponent: Canvas {
            id: decodeCanvas
            readonly property url art: Qt.resolvedUrl("../../assets/campsite-approved.webp")
            width: 720 / root.dpr
            height: 480 / root.dpr
            visible: false
            // An image another canvas already loaded comes from Qt's cache
            // without imageLoaded, so check for that too.
            Component.onCompleted: { loadImage(art); if (isImageLoaded(art)) requestPaint(); }
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
                root.decodedDpr = root.dpr;
                canvas.bg = Fire.cacheBackground(Fire.prepareBackground(src, 720, 480));
                canvas.repaintAll();
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

        property var bg: root.reuseArt ? Fire.cachedBackground() : null
        property var fb: Fire.createFrame()
        property int frames: 0
        property int fullFrames: 0

        // Most frames copy only what changed, which assumes the canvas still
        // holds the last frame. It doesn't whenever its surface goes away:
        // hiding the popup's layer-shell window drops its scene graph, the
        // Canvas deletes its 2D context with it, and Quickshell shows the
        // content in a new backing window next time, so getContext() hands
        // back a fresh, empty image. Any sign of that (a different context
        // object, a new window, the window shown again, a size, scale or
        // availability change, the art arriving) makes the next frames full
        // ones.
        //
        // Not just one: on a real Wayland surface the first paint into a new
        // context is dropped (its texture only exists after the next sync),
        // so full frames continue until two of them have been painted with
        // the window presenting a frame in between.
        property int fullLeft: 2
        property int fullAtSwap: -1
        property int swaps: 0
        property var lastCtx: null
        property var out: null
        readonly property var hostWindow: Window.window
        function repaintAll() { fullLeft = 2; requestPaint(); }
        onAvailableChanged: repaintAll()
        onCanvasSizeChanged: repaintAll()
        onCanvasWindowChanged: repaintAll()
        onContextChanged: repaintAll()
        onHostWindowChanged: repaintAll()
        onVisibleChanged: repaintAll()
        Connections {
            target: canvas.hostWindow
            ignoreUnknownSignals: true
            function onVisibleChanged() { canvas.repaintAll(); }
            function onFrameSwapped() { canvas.swaps++; }
        }
        Connections {
            target: root
            function onDprChanged() { canvas.repaintAll(); }
            function onVisibleChanged() { canvas.repaintAll(); }
            function onRunningChanged() { if (root.running) canvas.repaintAll(); }
        }

        // Copying a frame. fire.js reports the rectangles it drew over the
        // art; this frame's and last frame's (whose pixels go back to the
        // art) select 12 x 12 tiles. Each row of tiles is cut into segments
        // of `segTiles` tiles, each with a persistent image at its own place,
        // and only pixels of selected tiles that differ from what the canvas
        // shows (`shown`, a pixel per word) are written into it: writes into
        // a canvas image cost far more than reads of a typed array, and about
        // seven in ten pixels in a dirty tile are unchanged from last frame.
        // Then each segment with changes is put once, from its left edge to
        // its last changed tile (Qt 6.12's putImageData draws nothing for a
        // non-zero dirty origin). Every put is drawn through the device scale
        // on the GUI thread, so both the number of puts and their area count.
        readonly property int tile: 12
        readonly property int segTiles: 5
        readonly property int segsX: Math.ceil(tilesX / segTiles)
        readonly property int tilesX: Fire.W / tile
        readonly property int tilesY: Fire.H / tile
        property var rectsA: Fire.createRects()
        property var rectsB: Fire.createRects()
        property bool flip: false
        property var tileFlags: new Uint8Array(tilesX * tilesY)
        // The part of each selected tile the rectangles touched, in tile
        // coordinates (x0, y0, x1, y1): a twinkling star is one pixel, not
        // a whole tile, to compare.
        property var tileBox: new Int8Array(tilesX * tilesY * 4)
        // Tiles whose image doesn't hold what the canvas shows (after a full
        // frame went up through `out`): rewritten whole next time.
        property var tileStale: new Uint8Array(tilesX * tilesY)
        property var segImages: []
        // fb and what the canvas shows, a pixel per word (RGBA, little-endian).
        property var fb32: new Uint32Array(fb.buffer)
        property var shown: new Uint32Array(Fire.W * Fire.H)

        function markTiles(list) {
            var r = list.r, f = tileFlags, b = tileBox, T = tile, cols = tilesX;
            for (var k = 0, q = 0; k < list.n; k++, q += 4) {
                var x0 = r[q], y0 = r[q + 1], x1 = r[q + 2], y1 = r[q + 3];
                var tx0 = (x0 / T) | 0, tx1 = ((x1 - 1) / T) | 0, ty1 = ((y1 - 1) / T) | 0;
                for (var ty = (y0 / T) | 0; ty <= ty1; ty++) {
                    var oy = ty * T, ly0 = y0 > oy ? y0 - oy : 0, ly1 = y1 < oy + T ? y1 - oy : T;
                    for (var tx = tx0; tx <= tx1; tx++) {
                        var t = ty * cols + tx, ox = tx * T, bi = t * 4;
                        var lx0 = x0 > ox ? x0 - ox : 0, lx1 = x1 < ox + T ? x1 - ox : T;
                        if (!f[t]) { f[t] = 1; b[bi] = lx0; b[bi + 1] = ly0; b[bi + 2] = lx1; b[bi + 3] = ly1; continue; }
                        if (lx0 < b[bi]) b[bi] = lx0; if (ly0 < b[bi + 1]) b[bi + 1] = ly0;
                        if (lx1 > b[bi + 2]) b[bi + 2] = lx1; if (ly1 > b[bi + 3]) b[bi + 3] = ly1;
                    }
                }
            }
        }

        function segment(ctx, ty, sg) {
            var key = ty * segsX + sg, img = segImages[key];
            if (!img) {
                var w = segTiles * tile;
                img = ctx.createImageData(w, tile);
                // Qt keeps pixels premultiplied: set alpha before colour.
                for (var a = 3, da = img.data, n = w * tile * 4; a < n; a += 4) da[a] = 255;
                segImages[key] = img;
                var first = ty * tilesX + sg * segTiles;
                tileStale.fill(1, first, Math.min(first + segTiles, (ty + 1) * tilesX));
            }
            return img;
        }

        // Writes a tile's changed pixels (in its touched box, or all of it
        // if its image is stale) into its segment's image; true if any
        // changed.
        function copyTile(ctx, index) {
            var T = tile, W = Fire.W, tx = index % tilesX, ty = (index - tx) / tilesX, sg = (tx / segTiles) | 0;
            var d = segment(ctx, ty, sg).data, f = fb32, s = shown, stale = tileStale[index] === 1, changed = false;
            var ox = tx * T, oy = ty * T, sx = sg * segTiles * T, sw = segTiles * T, b = tileBox, bi = index * 4, j, i, e, v;
            var x0 = ox, y0 = oy, x1 = ox + T, y1 = oy + T;
            if (!stale) { x0 += b[bi]; y0 += b[bi + 1]; x1 = ox + b[bi + 2]; y1 = oy + b[bi + 3]; }
            for (var y = y0; y < y1; y++) {
                j = ((y - oy) * sw + x0 - sx) * 4;
                for (i = y * W + x0, e = y * W + x1; i < e; i++, j += 4) {
                    v = f[i];
                    if (v !== s[i]) { s[i] = v; changed = true; }
                    else if (!stale) continue;
                    d[j] = v & 255; d[j + 1] = (v >>> 8) & 255; d[j + 2] = (v >>> 16) & 255;
                }
            }
            tileStale[index] = 0;
            return changed;
        }

        // The whole frame in one put, through `out`.
        function putAll(ctx) {
            var d = out.data, f = fb32, n = Fire.W * Fire.H, v;
            for (var i = 0, j = 0; i < n; i++, j += 4) {
                v = f[i];
                d[j] = v & 255; d[j + 1] = (v >>> 8) & 255; d[j + 2] = (v >>> 16) & 255;
            }
            ctx.putImageData(out, 0, 0, 0, 0, Fire.W, Fire.H);
            shown.set(f);
            tileStale.fill(1);
            tileFlags.fill(0);
        }

        onPaint: {
            if (!bg || !root.fire) return;
            var ctx = getContext("2d");
            if (!ctx) return;
            if (ctx !== lastCtx) { lastCtx = ctx; fullLeft = 2; }
            if (!out) {
                // One row taller than the canvas: a put of an image exactly
                // the canvas's size replaces the backing image 1:1 in device
                // pixels on Wayland (half size at scale 2), not through the
                // device scale like any other put.
                out = ctx.createImageData(Fire.W, Fire.H + 1);
                // Qt keeps pixels premultiplied: set alpha before colour.
                var d = out.data;
                for (var a = 3; a < d.length; a += 4) d[a] = 255;
            }
            var cur = flip ? rectsA : rectsB, prev = flip ? rectsB : rectsA;
            flip = !flip;
            Fire.render(fb, root.fire.sim, bg, cur);
            if (fullLeft > 0) {
                // Counts only once the window has presented since the last
                // full frame (or when there is no window to ask).
                var presented = hostWindow && ("frameSwapped" in hostWindow) ? swaps : frames;
                if (presented !== fullAtSwap) { fullLeft--; fullAtSwap = presented; }
                putAll(ctx);
                fullFrames++;
            } else {
                markTiles(prev);
                markTiles(cur);
                var flags = tileFlags, cols = tilesX, T = tile, per = segTiles;
                for (var ty = 0; ty < tilesY; ty++) {
                    for (var t0 = 0; t0 < cols; t0 += per) {
                        var tEnd = Math.min(t0 + per, cols), last = -1, tx, k;
                        for (tx = t0, k = ty * cols + t0; tx < tEnd; tx++, k++)
                            if (flags[k] && copyTile(ctx, k)) last = tx;
                        if (last < 0) continue;
                        // The put starts at the segment's left edge: tiles on
                        // the way whose image isn't current are filled first.
                        for (tx = t0, k = ty * cols + t0; tx < last; tx++, k++)
                            if (tileStale[k]) copyTile(ctx, k);
                        ctx.putImageData(segImages[ty * segsX + t0 / per], t0 * T, ty * T, 0, 0, (last + 1 - t0) * T, T);
                    }
                }
                flags.fill(0);
            }
            frames++;
        }
    }

    // 20 fps like the reference's 50 ms gate; about 5.5 fps with reduced motion.
    Timer {
        interval: root.fire.reducedMotion ? 180 : 50
        repeat: true
        running: root.running && root.visible && canvas.bg !== null && !!canvas.hostWindow && canvas.hostWindow.visible
        onTriggered: canvas.requestPaint()
    }

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
