// Renders the app icon: a rounded dark tile with the 🖐️ glyph, at one size.
// Usage: mouse-icon <size> <output.png>
// Driven by scripts/build-icon.mjs, which stitches the sizes into an .icns.

import AppKit
import Foundation

let args = CommandLine.arguments
guard args.count == 3, let size = Double(args[1]) else {
    FileHandle.standardError.write("usage: make-icon <size> <out.png>\n".data(using: .utf8)!)
    exit(1)
}
let out = URL(fileURLWithPath: args[2])

let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()

// Rounded tile, matching the app's dark surface colour.
let inset = size * 0.06
let rect = NSRect(x: inset, y: inset, width: size - inset * 2, height: size - inset * 2)
let tile = NSBezierPath(roundedRect: rect, xRadius: size * 0.22, yRadius: size * 0.22)
NSColor(calibratedRed: 0.078, green: 0.098, blue: 0.145, alpha: 1).setFill()
tile.fill()
NSColor(calibratedRed: 0.545, green: 0.616, blue: 1.0, alpha: 0.55).setStroke()
tile.lineWidth = max(1, size * 0.012)
tile.stroke()

let glyph = "🖐️" as NSString
let fontSize = size * 0.52
let attrs: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: fontSize),
]
let drawn = glyph.size(withAttributes: attrs)
glyph.draw(
    at: NSPoint(x: (size - drawn.width) / 2, y: (size - drawn.height) / 2),
    withAttributes: attrs
)

image.unlockFocus()

guard let tiff = image.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let png = rep.representation(using: .png, properties: [:]) else {
    FileHandle.standardError.write("failed to encode png\n".data(using: .utf8)!)
    exit(1)
}
try png.write(to: out)
