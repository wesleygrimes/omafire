import QtQuick

// Stand-in for the host's qs.Ui BarWidget (same injected properties).
Item {
    property QtObject bar: null
    property string moduleName: ""
    property var settings: ({})
    property string fixedEdge: "center"
}
