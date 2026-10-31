import QtQuick
import Quickshell
import qs.Ui
import qs.Commons
import "fire"

// Bar widget entry point. The icon toggles the popup; the popup is a
// KeyboardPanel anchored to the icon (the host clamps it to the output and
// flips it for bottom, left and right bars). Every monitor's widget shares the
// one fire in FireSession.
BarWidget {
    id: root
    moduleName: "wesleygrimes.omafire"

    readonly property var session: FireSession
    readonly property bool opened: session.owner === root
    property bool popoutSwitchClosing: false

    function open() { popoutSwitchClosing = false; session.openOn(root); }
    function close() { if (session.owner === root) session.closePopup(); }
    function closeForPopoutSwitch() { popoutSwitchClosing = true; close(); }

    // Hover tooltip through the host bar, like the first-party widgets:
    // "OmaFire: Burning steadily", kept current while hovered, hidden on
    // exit and whenever the popup is open.
    readonly property string tooltipText: "OmaFire: " + (session.fire ? session.fire.statusText.replace(/^[●○]\s*/, "") : "")
    readonly property bool tooltipWanted: hover.hovered && !opened
    function showTooltip() { if (bar && typeof bar.showTooltip === "function") bar.showTooltip(button, tooltipText); }
    function hideTooltip() { if (bar && typeof bar.hideTooltip === "function") bar.hideTooltip(button); }
    onTooltipWantedChanged: tooltipWanted ? showTooltip() : hideTooltip()
    onTooltipTextChanged: if (tooltipWanted) showTooltip()

    HoverHandler { id: hover }

    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight

    Component.onCompleted: session.register(root)
    Component.onDestruction: { if (tooltipWanted) hideTooltip(); session.unregister(root); }

    BarIconButton {
        id: button
        anchors.fill: parent
        bar: root.bar
        useActiveColor: false
        active: root.opened
        iconComponent: Component {
            FireIcon { fire: root.session.fire }
        }
        onPressed: b => { if (b === Qt.LeftButton) { if (root.opened) root.close(); else root.open(); } }
    }

    KeyboardPanel {
        id: panel
        anchorItem: button
        bar: root.bar
        owner: root
        open: root.opened
        // The popup draws its own 1 px border and square corners, edge to
        // edge over the host card, so the reference look holds on any theme.
        padding: 0
        borderSpec: Border.none()
        contentWidth: 390
        contentHeight: 381
        focusTarget: panel.loadedContent
        content: Component {
            FirePopup {
                fire: root.session.fire
                running: root.opened
                onCloseRequested: root.close()
            }
        }
    }
}
