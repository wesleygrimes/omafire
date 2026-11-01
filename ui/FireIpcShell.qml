import QtQuick
import Quickshell.Io
import qs.Commons

// OmaFire's IPC on Omarchy 4.5 and newer, through the host's ShellIpc.
// FireSession creates it at runtime and falls back to FireIpcPlain.qml when
// ShellIpc doesn't exist (Omarchy 4.0.x). Keep the calls identical to
// FireIpcPlain.qml (tests/package.test.js checks).
QtObject {
    id: box
    required property QtObject session
    readonly property string route: "shell"

    // The handler holds only the calls: IpcHandler exposes every property and
    // signal it has, and the session object can't cross IPC.
    property ShellIpc handler: ShellIpc {
        target: box.session.ipcTarget

        function toggle(): void { var w = box.session.owner || box.session.preferredWidget(); box.session.toggleOn(w); }
        function open(): void { box.session.openOn(box.session.preferredWidget()); }
        function close(): void { box.session.closePopup(); }
        function addLog(): void { box.session.fire.addLog(); }
        function stoke(): void { box.session.fire.stoke(); }
        function poke(): void { box.session.fire.poke(); }
        function sound(): void { box.session.fire.toggleSound(); }
        function status(): string { return box.session.fire.statusJson(); }
    }
}
