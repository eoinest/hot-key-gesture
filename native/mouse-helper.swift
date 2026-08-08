// Persistent cursor-mover for HotKey Gesture.
//
// Reads commands on stdin, one per line:
//   "<x> <y>"  move the cursor to global screen pixels
//   "click"    left click at the current cursor position
//   "quit"     exit
//
// Spawning a process per update would cap us far below camera frame rate, so
// the app keeps one of these alive for as long as pointer control is active.
//
// Built by scripts/build-helper.mjs; requires Xcode command line tools.

import CoreGraphics
import Foundation

setvbuf(stdout, nil, _IONBF, 0)

/// Left click where the cursor currently sits, so a click never moves the pointer.
func clickAtCursor() {
    guard let probe = CGEvent(source: nil) else { return }
    let point = probe.location
    for type in [CGEventType.leftMouseDown, .leftMouseUp] {
        if let event = CGEvent(
            mouseEventSource: nil,
            mouseType: type,
            mouseCursorPosition: point,
            mouseButton: .left
        ) {
            event.post(tap: .cghidEventTap)
        }
    }
}

while let line = readLine(strippingNewline: true) {
    if line == "quit" { break }
    if line == "click" {
        clickAtCursor()
        continue
    }
    let parts = line.split(separator: " ")
    guard parts.count == 2,
          let x = Double(parts[0]),
          let y = Double(parts[1]) else { continue }

    let point = CGPoint(x: x, y: y)
    // A posted mouseMoved event both moves the cursor and lets apps see the
    // hover, which a bare CGWarpMouseCursorPosition would not do.
    if let event = CGEvent(
        mouseEventSource: nil,
        mouseType: .mouseMoved,
        mouseCursorPosition: point,
        mouseButton: .left
    ) {
        event.post(tap: .cghidEventTap)
    }
}
