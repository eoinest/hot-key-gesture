// Persistent cursor-mover for HotKey Gesture.
//
// Reads "<x> <y>" lines (global screen pixels) on stdin and moves the cursor.
// Spawning a process per update would cap us far below camera frame rate, so
// the app keeps one of these alive for as long as pointer control is active.
//
// Built by scripts/build-helper.mjs; requires Xcode command line tools.

import CoreGraphics
import Foundation

setvbuf(stdout, nil, _IONBF, 0)

while let line = readLine(strippingNewline: true) {
    if line == "quit" { break }
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
