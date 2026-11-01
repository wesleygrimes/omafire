pragma Singleton
import QtQuick

// Stand-in for the host's qs.Commons Border.
QtObject {
    function none() { return { color: "transparent", widths: { top: 0, right: 0, bottom: 0, left: 0 } }; }
}
