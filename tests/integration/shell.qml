import QtQuick
import Quickshell
import Quickshell.Io
import "ui" as OmaFire

// Integration harness (copied with ui/ and assets/ into tests/out/integration/config by the test): the real OmaFireBar, FireSession, FileView persistence
// and IPC under Quickshell, with tiny stand-ins for the host's qs.Ui and
// qs.Commons (tests/integration/Ui, Commons). Two bars stand for two
// monitors. Driven by tests/integration.test.js through `qs ipc`.
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
        function popupBuilt(): bool { return !!barA.children[1].loadedContent || !!barB.children[1].loadedContent; }
        function rendering(): bool {
            var p = barA.children[1].loadedContent || barB.children[1].loadedContent;
            return !!p && p.running;
        }
        function save(): void { OmaFire.FireSession.save(); }
        function quit(): void { Qt.quit(); }
    }
}
