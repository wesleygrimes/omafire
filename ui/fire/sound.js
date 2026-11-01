.pragma library
// How loud each fire layer plays for a given heat and boost. FireAudio
// multiplies these by its master level. Plain JavaScript, so node can test it.
//
// embers   always there while anything burns; eases back a little when hot
// crackle  the steady fire; follows heat up from a low fire
// roar     a hot fire, or a stoke or a fresh log (boost) for a moment
//
// Numbers only, no objects: FireState sets heat at 60 Hz.

function smooth(a, b, x) {
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
}

function embersGain(heat) {
    return smooth(0, 0.08, heat) * (1 - 0.3 * smooth(0.5, 1, heat));
}

function crackleGain(heat) {
    return smooth(0.08, 0.55, heat);
}

function roarGain(heat, boost) {
    var b = boost > 1 ? 1 : boost > 0 ? boost : 0;
    // A cold hearth has nothing to roar, however hard it's stoked.
    return Math.max(smooth(0.6, 0.95, heat), b * smooth(0, 0.1, heat));
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { embersGain: embersGain, crackleGain: crackleGain, roarGain: roarGain };
}
