import QtQuick

// Stand-in for Omarchy 4.0.x's qs.Ui KeyboardPanel: the same properties as
// 4.5 minus the lazy `content` slot and `loadedContent`. Content is plain
// children (default property contentItem), built with the panel. No window.
Item {
    id: root
    required property Item anchorItem
    required property QtObject bar
    property var owner: null
    property bool open: false
    property int padding: 0
    property var borderSpec: null
    property int contentWidth: 0
    property int contentHeight: 0
    property Item focusTarget: null
    default property alias contentItem: holder.children
    width: contentWidth
    height: contentHeight
    Item { id: holder; anchors.fill: parent }
}
