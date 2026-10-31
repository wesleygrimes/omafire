import QtQuick

// Stand-in for the host's qs.Ui KeyboardPanel: same properties, lazy content
// built on first open and kept, no window.
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
    property Component content: null
    property bool contentRequested: false
    readonly property Item loadedContent: loader.item
    onOpenChanged: if (open) contentRequested = true
    width: contentWidth
    height: contentHeight
    Loader {
        id: loader
        active: !!root.content && (root.open || root.contentRequested)
        sourceComponent: root.content
    }
}
