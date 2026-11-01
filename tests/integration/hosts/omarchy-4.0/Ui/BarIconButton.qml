import QtQuick

// Stand-in for the host's qs.Ui BarIconButton: builds the icon component and
// exposes press() so the harness can click it.
Item {
    id: root
    property QtObject bar: null
    property Component iconComponent: null
    property bool active: false
    property bool useActiveColor: true
    signal pressed(int button)
    implicitWidth: 27
    implicitHeight: 26
    Loader { id: icon; sourceComponent: root.iconComponent }
    readonly property Item iconItem: icon.item
    function press() { pressed(Qt.LeftButton); }
}
