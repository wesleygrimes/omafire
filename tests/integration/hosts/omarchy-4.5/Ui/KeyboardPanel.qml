import QtQuick

// Stand-in for Omarchy 4.5's qs.Ui KeyboardPanel: same properties, plain
// children (default property contentItem) and the lazy `content` slot built
// on first open and kept, no window.
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
    property bool heightLive: false
    property Item focusTarget: null
    default property alias contentItem: holder.children
    property Component content: null
    property bool contentRequested: false
    readonly property Item loadedContent: loader.item
    onOpenChanged: if (open) contentRequested = true
    width: contentWidth
    height: contentHeight
    Item {
        id: holder
        anchors.fill: parent
        Loader {
            id: loader
            anchors.fill: parent
            active: !!root.content && (root.open || root.contentRequested)
            sourceComponent: root.content
        }
    }
}
