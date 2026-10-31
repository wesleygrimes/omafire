import QtQuick

// The compact popup from the approved reference: 390 px wide including its
// 1 px border, OMAFIRE header with the status label, the 3:2 scene, three
// footer buttons and the hint. Plain QtQuick so it renders standalone.
//
// Keys: A adds a log, S stokes, M toggles sound, Escape asks to close, Tab
// moves between the buttons (Space/Enter press them).
FocusScope {
    id: root

    required property QtObject fire
    property bool running: true
    property string fontFamily: "monospace"
    property bool keyboardFocusVisible: false

    signal closeRequested()

    readonly property alias scene: scene
    readonly property alias addButton: addButton
    readonly property alias stokeButton: stokeButton
    readonly property alias soundButton: soundButton

    readonly property int interiorWidth: width - 2

    implicitWidth: 390
    implicitHeight: 1 + header.height + 1 + scene.height + footer.height + 1
    width: implicitWidth
    height: implicitHeight
    focus: true

    Keys.onPressed: function (event) {
        if (event.key === Qt.Key_Tab || event.key === Qt.Key_Backtab) { keyboardFocusVisible = true; return; }
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
        height: 36

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
        height: 1 + 11 + 36 + 9 + 16 + 10

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
                KeyNavigation.tab: stokeButton
                onClicked: root.fire.addLog()
            }
            FireButton {
                id: stokeButton
                objectName: "stoke"
                width: actions.cell
                text: "Stoke"
                fontFamily: root.fontFamily
                showFocusRing: root.keyboardFocusVisible
                KeyNavigation.tab: soundButton
                KeyNavigation.backtab: addButton
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
                KeyNavigation.tab: addButton
                KeyNavigation.backtab: stokeButton
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

    // Any pointer use hides the keyboard focus ring again.
    PointHandler {
        onActiveChanged: if (active) root.keyboardFocusVisible = false
    }
}
