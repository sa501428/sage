import AppKit
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let sourceURL = root.appendingPathComponent("desktop/logo.bands.png")
let iconsDir = root.appendingPathComponent("desktop/icons", isDirectory: true)
let iconsetDir = iconsDir.appendingPathComponent("SAGE.iconset", isDirectory: true)
let icnsURL = iconsDir.appendingPathComponent("SAGE.icns")
let icoURL = iconsDir.appendingPathComponent("SAGE.ico")

try FileManager.default.createDirectory(at: iconsetDir, withIntermediateDirectories: true)

guard let source = NSImage(contentsOf: sourceURL) else {
  fatalError("Could not load \(sourceURL.path)")
}

func squarePNG(size: Int) throws -> Data {
  guard let representation = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: size,
    pixelsHigh: size,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  ) else {
    fatalError("Could not create \(size)x\(size) bitmap")
  }

  representation.size = NSSize(width: size, height: size)
  guard let context = NSGraphicsContext(bitmapImageRep: representation) else {
    fatalError("Could not create graphics context")
  }

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = context
  context.cgContext.clear(CGRect(x: 0, y: 0, width: size, height: size))
  context.imageInterpolation = .high

  let sourceSize = source.size
  let scale = min(Double(size) / sourceSize.width, Double(size) / sourceSize.height)
  let drawWidth = sourceSize.width * scale
  let drawHeight = sourceSize.height * scale
  let drawRect = NSRect(
    x: (Double(size) - drawWidth) / 2,
    y: (Double(size) - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight
  )
  source.draw(in: drawRect, from: .zero, operation: .sourceOver, fraction: 1)
  NSGraphicsContext.restoreGraphicsState()

  guard let data = representation.representation(using: .png, properties: [:]) else {
    fatalError("Could not encode \(size)x\(size) PNG")
  }
  return data
}

let macIconFiles: [(String, Int)] = [
  ("icon_16x16.png", 16),
  ("icon_16x16@2x.png", 32),
  ("icon_32x32.png", 32),
  ("icon_32x32@2x.png", 64),
  ("icon_128x128.png", 128),
  ("icon_128x128@2x.png", 256),
  ("icon_256x256.png", 256),
  ("icon_256x256@2x.png", 512),
  ("icon_512x512.png", 512),
  ("icon_512x512@2x.png", 1024)
]

var pngCache: [Int: Data] = [:]
for (filename, size) in macIconFiles {
  let data = try pngCache[size] ?? squarePNG(size: size)
  pngCache[size] = data
  try data.write(to: iconsetDir.appendingPathComponent(filename))
}

func appendAscii(_ text: String, to data: inout Data) {
  data.append(text.data(using: .ascii)!)
}

func appendUInt32BE(_ value: UInt32, to data: inout Data) {
  data.append(UInt8((value >> 24) & 0xff))
  data.append(UInt8((value >> 16) & 0xff))
  data.append(UInt8((value >> 8) & 0xff))
  data.append(UInt8(value & 0xff))
}

let icnsImages: [(String, Int)] = [
  ("icp4", 16),
  ("icp5", 32),
  ("icp6", 64),
  ("ic07", 128),
  ("ic08", 256),
  ("ic09", 512),
  ("ic10", 1024)
]

var icns = Data()
appendAscii("icns", to: &icns)
appendUInt32BE(0, to: &icns)
for (type, size) in icnsImages {
  let data = try pngCache[size] ?? squarePNG(size: size)
  pngCache[size] = data
  appendAscii(type, to: &icns)
  appendUInt32BE(UInt32(data.count + 8), to: &icns)
  icns.append(data)
}

let totalSize = UInt32(icns.count)
icns.replaceSubrange(4..<8, with: [
  UInt8((totalSize >> 24) & 0xff),
  UInt8((totalSize >> 16) & 0xff),
  UInt8((totalSize >> 8) & 0xff),
  UInt8(totalSize & 0xff)
])
try icns.write(to: icnsURL)

func appendUInt16LE(_ value: UInt16, to data: inout Data) {
  data.append(UInt8(value & 0xff))
  data.append(UInt8((value >> 8) & 0xff))
}

func appendUInt32LE(_ value: UInt32, to data: inout Data) {
  data.append(UInt8(value & 0xff))
  data.append(UInt8((value >> 8) & 0xff))
  data.append(UInt8((value >> 16) & 0xff))
  data.append(UInt8((value >> 24) & 0xff))
}

let icoSizes = [16, 24, 32, 48, 64, 128, 256]
let icoImages = try icoSizes.map { size -> (Int, Data) in
  let data = try pngCache[size] ?? squarePNG(size: size)
  pngCache[size] = data
  return (size, data)
}

var ico = Data()
appendUInt16LE(0, to: &ico)
appendUInt16LE(1, to: &ico)
appendUInt16LE(UInt16(icoImages.count), to: &ico)

var imageOffset = UInt32(6 + icoImages.count * 16)
for (size, data) in icoImages {
  ico.append(UInt8(size == 256 ? 0 : size))
  ico.append(UInt8(size == 256 ? 0 : size))
  ico.append(0)
  ico.append(0)
  appendUInt16LE(1, to: &ico)
  appendUInt16LE(32, to: &ico)
  appendUInt32LE(UInt32(data.count), to: &ico)
  appendUInt32LE(imageOffset, to: &ico)
  imageOffset += UInt32(data.count)
}

for (_, data) in icoImages {
  ico.append(data)
}

try ico.write(to: icoURL)
print("Generated \(icnsURL.path)")
print("Generated \(icoURL.path)")
