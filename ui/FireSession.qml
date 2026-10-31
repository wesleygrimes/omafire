pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import qs.Commons
import "fire"

// The plugin's one fire, shared by every bar (one per monitor), its saved
// state, and its IPC target. Bar widgets register here; at most one of them
// has the popup open at a time.
Singleton {
    id: session

    readonly property string ipcTarget: "wesleygrimes.omafire"

    // $XDG_STATE_HOME/omafire/state.json, else ~/.local/state/omafire/state.json.
    // OMAFIRE_STATE names another file (tests).
    readonly property string statePath: Quickshell.env("OMAFIRE_STATE")
        || (Quickshell.env("XDG_STATE_HOME") || Quickshell.env("HOME") + "/.local/state") + "/omafire/state.json"

    property var widgets: []
    property var owner: null
    readonly property bool isOpen: owner !== null

    property FireState fire: FireState {
        open: session.isOpen
        reducedMotion: Style.reduceMotion
    }

    function register(widget) {
        if (widgets.indexOf(widget) === -1) widgets = widgets.concat([widget]);
    }
    function unregister(widget) {
        widgets = widgets.filter(function (w) { return w !== widget; });
        if (owner === widget) owner = null;
    }

    // The widget on the focused output, else the first one.
    function preferredWidget() {
        var focused = Hyprland.focusedMonitor ? Hyprland.focusedMonitor.name : "";
        for (var i = 0; i < widgets.length; i++) {
            var w = widgets[i];
            var win = w && w.QsWindow ? w.QsWindow.window : null;
            if (win && win.screen && focused && win.screen.name === focused) return w;
        }
        return widgets.length ? widgets[0] : null;
    }

    function openOn(widget) { if (widget) owner = widget; }
    function closePopup() { owner = null; }
    function toggleOn(widget) { if (owner === widget) owner = null; else openOn(widget); }

    // --------------------------------------------------------------- persistence
    property bool loaded: false
    property FileView store: FileView {
        path: session.statePath
        blockLoading: true
        printErrors: false
        atomicWrites: true
        onLoaded: {
            session.fire.restore(text());
            session.loaded = true;
        }
        onLoadFailed: session.loaded = true   // first run: the default fire
    }

    function save() {
        if (!loaded) return;
        store.setText(fire.serialize() + "\n");
        dirty = false;
    }

    property bool dirty: false
    property Connections fireEvents: Connections {
        target: session.fire
        function onChangedByUser() { session.dirty = true; saveSoon.restart(); }
        function onStatusKeyChanged() { session.dirty = true; }
    }
    property Timer saveSoon: Timer { interval: 500; onTriggered: session.save() }
    // While the fire burns, keep the file within 30 s of the truth.
    property Timer saveEvery: Timer {
        interval: 30000
        repeat: true
        running: session.fire.statusKey !== "resting" || session.dirty
        onTriggered: session.save()
    }
    onIsOpenChanged: save()

    // ----------------------------------------------------------------------- IPC
    property ShellIpc ipc: ShellIpc {
        target: session.ipcTarget
        function toggle(): void { var w = session.owner || session.preferredWidget(); session.toggleOn(w); }
        function open(): void { session.openOn(session.preferredWidget()); }
        function close(): void { session.closePopup(); }
        function addLog(): void { session.fire.addLog(); }
        function stoke(): void { session.fire.stoke(); }
        function poke(): void { session.fire.poke(); }
        function sound(): void { session.fire.toggleSound(); }
        function status(): string { return session.fire.statusJson(); }
    }

    Component.onDestruction: {
        save();
        fire.shutdown();
    }
}
