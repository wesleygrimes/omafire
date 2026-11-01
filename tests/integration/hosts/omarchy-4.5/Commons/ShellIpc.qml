import QtQuick
import Quickshell.Io

// Stand-in for the host's ShellIpc (an IpcHandler it also answers over its
// own socket). A bare IpcHandler is reachable with `qs ipc`.
IpcHandler {}
