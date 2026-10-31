import QtQuick
import QtTest
import "../../ui/fire"

// The keyboard focus ring: a pointer click hides it, and the next Tab or
// Backtab shows it again, whichever button has focus at the time.
Item {
    id: host
    width: 420
    height: 420

    FireState { id: fire; autoTick: false; open: true }

    FirePopup { id: popup; x: 10; y: 10; fire: fire }

    TestCase {
        name: "focus"
        when: windowShown

        function test_tab_after_click_shows_ring() {
            popup.forceActiveFocus();
            verify(!popup.keyboardFocusVisible, "ring starts hidden");

            keyClick(Qt.Key_Tab);
            verify(popup.keyboardFocusVisible);
            verify(popup.addButton.activeFocus);

            // A click hides the ring but leaves keyboard focus on the button.
            mouseClick(popup.stokeButton);
            verify(!popup.keyboardFocusVisible, "pointer use hides the ring");
            verify(popup.addButton.activeFocus);

            keyClick(Qt.Key_Tab);
            verify(popup.keyboardFocusVisible, "Tab after a click shows the ring");
            verify(popup.stokeButton.activeFocus, "and moves focus on");

            mouseClick(popup.addButton);
            verify(!popup.keyboardFocusVisible);
            keyClick(Qt.Key_Backtab);
            verify(popup.keyboardFocusVisible, "Backtab after a click shows the ring");
            verify(popup.addButton.activeFocus, "and moves focus back");

            keyClick(Qt.Key_Backtab);
            verify(popup.soundButton.activeFocus, "Backtab wraps to the last button");
            keyClick(Qt.Key_Tab);
            verify(popup.addButton.activeFocus, "Tab wraps to the first button");
        }
    }
}
