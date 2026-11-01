.pragma library
// Popup size. The scene stays 3:2, so the panel has one degree of freedom:
// its width. The default is the reference 390 x 381. A saved width lives
// beside the fire, not inside it, so a missing or broken size file still
// opens at that default.
//
// The host card is centered on the bar icon and its top is pinned under the
// bar. Growing the width by 1 moves the lower-left corner by (-1/2, +2/3)
// until the card hits the screen. widthDeltaForCorner projects the pointer
// onto that path. Once a drag has seen a real step it can pass the measured
// slope, which becomes (-1, +2/3) after the right edge pins to the screen.

var DEFAULT_WIDTH = 390;
var MIN_WIDTH = 300;
var MAX_WIDTH = 960;
var HEADER = 36;
// 1 px rule, 11 px gap, 36 px buttons, 9 px gap, 16 px hint, 10 px pad.
var FOOTER = 83;
var CHROME = 1 + HEADER + 1 + FOOTER + 1;

function sceneHeight(panelWidth) {
    return Math.round((panelWidth - 2) * 2 / 3);
}

function panelHeight(panelWidth) {
    return CHROME + sceneHeight(panelWidth);
}

function clampWidth(width) {
    if (typeof width !== "number" || !isFinite(width)) return DEFAULT_WIDTH;
    var w = Math.round(width);
    if (w < MIN_WIDTH) return MIN_WIDTH;
    if (w > MAX_WIDTH) return MAX_WIDTH;
    return w;
}

// errX/errY: where the corner should move (right, down), in logical pixels.
// slopeX/slopeY: where the corner actually moves per +1 width.
function widthDeltaForCorner(errX, errY, slopeX, slopeY) {
    if (slopeX === undefined) slopeX = -0.5;
    if (slopeY === undefined) slopeY = 2 / 3;
    var denom = slopeX * slopeX + slopeY * slopeY;
    if (!(denom > 1e-6)) return 0;
    return (slopeX * errX + slopeY * errY) / denom;
}

function widthAfterCornerDrag(startWidth, dx, dy, slopeX, slopeY) {
    return clampWidth(startWidth + widthDeltaForCorner(dx, dy, slopeX, slopeY));
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        DEFAULT_WIDTH: DEFAULT_WIDTH, MIN_WIDTH: MIN_WIDTH, MAX_WIDTH: MAX_WIDTH,
        HEADER: HEADER, FOOTER: FOOTER, CHROME: CHROME,
        sceneHeight: sceneHeight, panelHeight: panelHeight, clampWidth: clampWidth,
        widthDeltaForCorner: widthDeltaForCorner, widthAfterCornerDrag: widthAfterCornerDrag
    };
}
