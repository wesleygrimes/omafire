import QtQuick

// A footer button styled like the reference's .of-actions button: 1 px
// border, flat fill, 12 px monospace label, brightness(1.25) on hover, 1 px
// press offset. The focus ring only appears for keyboard focus.
Item {
    id: root

    property string text: ""
    property color fill: "#1a1c1b"
    property color line: "#454641"
    property color ink: "#e0d6c7"
    property bool pressedLook: false
    property color pressedFill: "#3d3020"
    property color pressedLine: "#ae8953"
    property color pressedInk: "#ffd28b"
    property string fontFamily: "monospace"
    property bool showFocusRing: false

    signal clicked()
    signal pointerPressed()

    // The popup moves focus on Tab itself (FirePopup.focusNext), so it always
    // sees the key and can show the ring.
    activeFocusOnTab: false
    implicitHeight: 36

    function brighten(c, k) {
        if (!hover.containsMouse) return c;
        return Qt.rgba(Math.min(1, c.r * k), Math.min(1, c.g * k), Math.min(1, c.b * k), c.a);
    }

    Accessible.role: Accessible.Button
    Accessible.name: text
    Accessible.checkable: pressedLook
    Accessible.onPressAction: clicked()
    Keys.onSpacePressed: clicked()
    Keys.onReturnPressed: clicked()
    Keys.onEnterPressed: clicked()

    Rectangle {
        id: face
        anchors.fill: parent
        anchors.topMargin: hover.pressed ? 1 : 0
        anchors.bottomMargin: hover.pressed ? -1 : 0
        color: root.brighten(root.pressedLook ? root.pressedFill : root.fill, 1.25)
        border.width: 1
        border.color: root.brighten(root.pressedLook ? root.pressedLine : root.line, 1.25)

        Text {
            anchors.fill: parent
            anchors.leftMargin: 9
            anchors.rightMargin: 9
            text: root.text
            color: root.brighten(root.pressedLook ? root.pressedInk : root.ink, 1.25)
            font.family: root.fontFamily
            font.pixelSize: 12
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
            elide: Text.ElideRight
        }
    }

    // Keyboard focus ring, outside the button so the button itself is unchanged.
    Rectangle {
        visible: root.activeFocus && root.showFocusRing
        anchors.fill: parent
        anchors.margins: -3
        color: "transparent"
        border.width: 1
        border.color: "#e9ab55"
    }

    MouseArea {
        id: hover
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onPressed: root.pointerPressed()
        onClicked: root.clicked()
    }
}
