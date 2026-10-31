import QtQuick
import QtTest
import "../../ui/fire"

// The keyboard focus ring: a pointer click hides it, and the next Tab or
// Backtab shows it again, moving on from the button that was clicked.
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

            // A click hides the ring and focuses the clicked button, like a
            // browser button, so Tab continues from there.
            mouseClick(popup.stokeButton);
            verify(!popup.keyboardFocusVisible, "pointer use hides the ring");
            verify(popup.stokeButton.activeFocus, "the clicked button takes focus");

            keyClick(Qt.Key_Tab);
            verify(popup.keyboardFocusVisible, "Tab after a click shows the ring");
            verify(popup.soundButton.activeFocus, "and moves on from the clicked button");

            mouseClick(popup.addButton);
            verify(!popup.keyboardFocusVisible);
            keyClick(Qt.Key_Backtab);
            verify(popup.keyboardFocusVisible, "Backtab after a click shows the ring");
            verify(popup.soundButton.activeFocus, "Backtab wraps to the last button");

            keyClick(Qt.Key_Tab);
            verify(popup.addButton.activeFocus, "Tab wraps to the first button");
        }
    }
}
