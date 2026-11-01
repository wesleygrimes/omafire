import QtQuick
import Quickshell
import Quickshell.Io
import "ui" as OmaFire

// Integration harness (copied with ui/, assets/ and one host's stand-ins into
// tests/out/integration/<host>/config by the test): the real OmaFireBar,
// FireSession, FileView persistence and IPC under Quickshell, with tiny
// stand-ins for the host's qs.Ui and qs.Commons from
// tests/integration/hosts/<host> (Omarchy 4.0.x and 4.5 differ). Two bars
// stand for two monitors. Driven by tests/integration.test.js through `qs ipc`.
ShellRoot {
    id: shell

    OmaFire.OmaFireBar { id: barA }
    OmaFire.OmaFireBar { id: barB }

    IpcHandler {
        target: "omafire-harness"
        function press(index: int): void { (index === 0 ? barA : barB).children[0].press(); }
        function openOn(): string {
            var s = OmaFire.FireSession;
            return s.owner === barA ? "A" : s.owner === barB ? "B" : "";
        }
        function widgets(): int { return OmaFire.FireSession.widgets.length; }
        function sameFire(): bool { return barA.session.fire === barB.session.fire; }
        function popupBuilt(): bool { return !!barA.popup || !!barB.popup; }
        function rendering(): bool {
            return (!!barA.popup && barA.popup.running) || (!!barB.popup && barB.popup.running);
        }
        function popupSize(): string {
            var p = barA.popup || barB.popup;
            return p ? p.width + "x" + p.height : "";
        }
        function ipcRoute(): string { return OmaFire.FireSession.ipcRoute; }
        function save(): void { OmaFire.FireSession.save(); }
        function quit(): void { Qt.quit(); }
    }
}
