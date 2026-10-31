import QtQuick
import Quickshell
import Quickshell.Io
import "ui/fire"

// CPU/memory harness for scripts/measure.js: a real window with the popup
// (open state) and a tiny window with the bar icon (closed state).
ShellRoot {
    FireState { id: fire; open: popupWindow.visible }

    FloatingWindow {
        id: popupWindow
        title: "omafire-perf-popup"
        implicitWidth: 390
        implicitHeight: 381
        color: "#101213"
        FirePopup { fire: fire; running: popupWindow.visible }
    }

    FloatingWindow {
        title: "omafire-perf-icon"
        implicitWidth: 24
        implicitHeight: 24
        color: "#101213"
        FireIcon { anchors.centerIn: parent; fire: fire }
    }

    IpcHandler {
        target: "omafire-perf"
        function close(): void { popupWindow.visible = false; }
        function open(): void { popupWindow.visible = true; }
        function quit(): void { Qt.quit(); }
    }
}
