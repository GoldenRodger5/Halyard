// Apple Vision text recognition → JSON [{text, conf, x, y, w, h}] in image pixels (top-left origin), one entry per word.
import Foundation
import Vision
import AppKit

let path = CommandLine.arguments[1]
guard let img = NSImage(contentsOfFile: path), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { print("[]"); exit(0) }
let W = Double(cg.width), H = Double(cg.height)
let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.usesLanguageCorrection = false
try VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
var out: [[String: Any]] = []
for obs in req.results ?? [] {
  guard let cand = obs.topCandidates(1).first else { continue }
  let s = cand.string
  var idx = s.startIndex
  for word in s.split(separator: " ") {
    guard let r = s.range(of: word, range: idx..<s.endIndex) else { continue }
    idx = r.upperBound
    if let box = try? cand.boundingBox(for: r) {
      let b = box.boundingBox
      out.append(["text": String(word), "conf": Double(cand.confidence * 100), "x": Int(b.minX * W), "y": Int((1 - b.maxY) * H), "w": Int(b.width * W), "h": Int(b.height * H)])
    }
  }
}
let data = try JSONSerialization.data(withJSONObject: out)
print(String(data: data, encoding: .utf8)!)
