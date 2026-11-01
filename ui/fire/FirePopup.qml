import QtQuick
import "panel.js" as Panel

// The compact popup from the approved reference: 390 px wide including its
// 1 px border, OMAFIRE header with the status label, the 3:2 scene, three
// footer buttons and the hint. Plain QtQuick so it renders standalone.
// panelWidth is the one size the host saves. Leave it at the default and the
// popup is the reference 390 x 381.
//
// Keys: A adds a log, S stokes, M toggles sound, Escape asks to close, Tab
// moves between the buttons (Space/Enter press them).
FocusScope {
    id: root

    required property QtObject fire
    property bool running: true
    property string fontFamily: "monospace"
    property bool keyboardFocusVisible: false
    property int panelWidth: Panel.DEFAULT_WIDTH
    property bool resizeActive: false

    signal closeRequested()
    // The host owns the width (it also sizes the card). Assigning panelWidth
    // here would break that binding.
    signal panelWidthCommit(int next)
    signal resizeDragged()

    readonly property alias scene: scene
    readonly property alias addButton: addButton
    readonly property alias stokeButton: stokeButton
    readonly property alias soundButton: soundButton
    readonly property alias resizeGrip: grip

    readonly property int interiorWidth: width - 2

    implicitWidth: panelWidth
    implicitHeight: Panel.panelHeight(panelWidth)
    width: implicitWidth
    height: implicitHeight
    focus: true

    // Each open starts like a fresh page: no ring, and the first Tab lands
    // on Add log.
    function resetFocus() {
        keyboardFocusVisible = false;
        addButton.focus = false;
        stokeButton.focus = false;
        soundButton.focus = false;
        forceActiveFocus();
    }
    onRunningChanged: if (running) resetFocus()

    // Tab and Backtab cycle the footer buttons here rather than through
    // KeyNavigation on the buttons, which would consume the key before this
    // handler sees it and leave the ring hidden after a pointer click.
    function focusNext(step) {
        var buttons = [addButton, stokeButton, soundButton], i = -1;
        for (var k = 0; k < buttons.length; k++) if (buttons[k].activeFocus) i = k;
        var j = i < 0 ? (step > 0 ? 0 : buttons.length - 1) : (i + step + buttons.length) % buttons.length;
        buttons[j].forceActiveFocus(step > 0 ? Qt.TabFocusReason : Qt.BacktabFocusReason);
    }

    Keys.onPressed: function (event) {
        if (event.key === Qt.Key_Tab || event.key === Qt.Key_Backtab) {
            keyboardFocusVisible = true;
            focusNext(event.key === Qt.Key_Tab && !(event.modifiers & Qt.ShiftModifier) ? 1 : -1);
            event.accepted = true;
            return;
        }
        if (event.modifiers & (Qt.ControlModifier | Qt.AltModifier | Qt.MetaModifier)) return;
        if (event.key === Qt.Key_A) { fire.addLog(); event.accepted = true; }
        else if (event.key === Qt.Key_S) { fire.stoke(); event.accepted = true; }
        else if (event.key === Qt.Key_M) { fire.toggleSound(); event.accepted = true; }
        else if (event.key === Qt.Key_Escape) { closeRequested(); event.accepted = true; }
    }

    Rectangle {
        anchors.fill: parent
        color: "#101213"
        border.width: 1
        border.color: "#646359"
    }

    Item {
        id: header
        x: 1
        y: 1
        width: root.interiorWidth
        height: Panel.HEADER

        Text {
            x: 12
            anchors.verticalCenter: parent.verticalCenter
            text: "OMAFIRE"
            color: "#e0d6c7"
            font.family: root.fontFamily
            font.pixelSize: 12
            font.letterSpacing: 2
        }
        Text {
            id: statusLabel
            objectName: "status"
            anchors.right: parent.right
            anchors.rightMargin: 12
            anchors.verticalCenter: parent.verticalCenter
            text: root.fire.statusText
            color: "#e9ab55"
            font.family: root.fontFamily
            font.pixelSize: 11
            Accessible.role: Accessible.StaticText
            Accessible.name: text
        }
    }
    Rectangle { x: 1; y: header.y + header.height; width: root.interiorWidth; height: 1; color: "#3d4140" }

    Rectangle {
        // The stage behind the canvas (#081322) only shows if the art is missing.
        x: 1
        y: scene.y
        width: scene.width
        height: scene.height
        color: "#081322"
    }
    FireScene {
        id: scene
        x: 1
        y: header.y + header.height + 1
        width: root.interiorWidth
        height: Math.round(width * 2 / 3)
        fire: root.fire
        running: root.running
        fontFamily: root.fontFamily
    }

    Item {
        id: footer
        x: 1
        y: scene.y + scene.height
        width: root.interiorWidth
        height: Panel.FOOTER

        Rectangle { width: parent.width; height: 1; color: "#3d4140" }

        Row {
            id: actions
            x: 12
            y: 12
            spacing: 8
            readonly property real cell: (footer.width - 24 - 16) / 3

            FireButton {
                id: addButton
                objectName: "addLog"
                width: actions.cell
                text: "+ Add log"
                fill: "#251e17"
                line: "#8b653a"
                ink: "#e9ab55"
                fontFamily: root.fontFamily
                showFocusRing: root.keyboardFocusVisible
                onPointerPressed: root.keyboardFocusVisible = false
                onClicked: root.fire.addLog()
            }
            FireButton {
                id: stokeButton
                objectName: "stoke"
                width: actions.cell
                text: "Stoke"
                fontFamily: root.fontFamily
                showFocusRing: root.keyboardFocusVisible
                onPointerPressed: root.keyboardFocusVisible = false
                onClicked: root.fire.stoke()
            }
            FireButton {
                id: soundButton
                objectName: "sound"
                width: actions.cell
                text: root.fire.sound ? "Sound on" : "Sound off"
                pressedLook: root.fire.sound
                fontFamily: root.fontFamily
                showFocusRing: root.keyboardFocusVisible
                onPointerPressed: root.keyboardFocusVisible = false
                onClicked: root.fire.toggleSound()
            }
        }

        Text {
            x: 12
            y: 12 + 36 + 9
            width: footer.width - 24
            height: 16
            text: root.fire.hint
            color: "#aaa599"
            font.family: root.fontFamily
            font.pixelSize: 11
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
        }
    }

    // Any pointer use hides the keyboard focus ring again (the buttons'
    // MouseAreas take their presses first, so they report them above).
    PointHandler {
        onActiveChanged: if (active) root.keyboardFocusVisible = false
    }

    // Lower-left corner. The host centers the card, so this drag asks for a
    // new width and the height follows. The grip remembers where the pointer
    // sat inside it and how the corner actually moved, then projects the
    // remaining error onto that path.
    Item {
        id: grip
        objectName: "resizeGrip"
        anchors.left: parent.left
        anchors.bottom: parent.bottom
        width: 22
        height: 22
        z: 2

        Accessible.role: Accessible.Pane
        Accessible.name: "Resize"

        Rectangle { x: 4; y: 16; width: 2; height: 2; color: "#b7ab9c" }
        Rectangle { x: 8; y: 16; width: 2; height: 2; color: "#b7ab9c" }
        Rectangle { x: 12; y: 16; width: 2; height: 2; color: "#b7ab9c" }
        Rectangle { x: 4; y: 12; width: 2; height: 2; color: "#b7ab9c" }
        Rectangle { x: 8; y: 12; width: 2; height: 2; color: "#b7ab9c" }
        Rectangle { x: 4; y: 8; width: 2; height: 2; color: "#b7ab9c" }

        MouseArea {
            id: gripArea
            anchors.fill: parent
            acceptedButtons: Qt.LeftButton
            hoverEnabled: true
            preventStealing: true
            cursorShape: Qt.SizeBDiagCursor

            property real holdX: 0
            property real holdY: 0
            property real slopeX: -0.5
            property real slopeY: 2 / 3
            property real trackedWidth: 0
            property real trackedX: 0
            property real trackedY: 0

            function corner() { return root.mapToGlobal(0, root.height); }

            function trackSlope(corner) {
                var moved = root.panelWidth - trackedWidth;
                if (Math.abs(moved) < 2) return;
                var sx = (corner.x - trackedX) / moved;
                var sy = (corner.y - trackedY) / moved;
                if (sx * sx + sy * sy <= 0.04) return;
                slopeX = sx;
                slopeY = sy;
                trackedWidth = root.panelWidth;
                trackedX = corner.x;
                trackedY = corner.y;
            }

            onPressed: function (mouse) {
                var pointer = mapToGlobal(mouse.x, mouse.y);
                var at = corner();
                holdX = pointer.x - at.x;
                holdY = pointer.y - at.y;
                trackedWidth = root.panelWidth;
                trackedX = at.x;
                trackedY = at.y;
                slopeX = -0.5;
                slopeY = 2 / 3;
                root.resizeActive = true;
                root.resizeDragged();
            }
            onPositionChanged: function (mouse) {
                if (!pressed) return;
                root.resizeDragged();
                var pointer = mapToGlobal(mouse.x, mouse.y);
                var at = corner();
                trackSlope(at);
                var errX = pointer.x - holdX - at.x;
                var errY = pointer.y - holdY - at.y;
                var dW = Panel.widthDeltaForCorner(errX, errY, slopeX, slopeY);
                if (dW > 120) dW = 120;
                if (dW < -120) dW = -120;
                if (Math.abs(dW) < 0.5) return;
                var next = Panel.clampWidth(root.panelWidth + dW);
                if (next !== root.panelWidth) root.panelWidthCommit(next);
            }
            onReleased: root.resizeActive = false
            onCanceled: root.resizeActive = false
        }
    }
}
