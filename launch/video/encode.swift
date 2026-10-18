// Reads raw BGRA frames from stdin and writes an H.264/AAC .mp4, muxing in an audio file.
//   swiftc -O encode.swift -o /tmp/mpg-encode
//   <frames on stdin> | /tmp/mpg-encode out.mp4 voice.wav WIDTH HEIGHT FPS FRAMES
import AVFoundation
import CoreVideo
import Foundation

let a = CommandLine.arguments
guard a.count == 7, let w = Int(a[3]), let h = Int(a[4]), let fps = Int32(a[5]), let total = Int(a[6]) else {
    FileHandle.standardError.write("usage: encode out.mp4 audio.wav W H FPS FRAMES < raw\n".data(using: .utf8)!); exit(2)
}
let outURL = URL(fileURLWithPath: a[1])
try? FileManager.default.removeItem(at: outURL)

let writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)
let vSettings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: w, AVVideoHeightKey: h,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 9_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel, AVVideoMaxKeyFrameIntervalKey: Int(fps) * 2],
]
let vIn = AVAssetWriterInput(mediaType: .video, outputSettings: vSettings)
vIn.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: vIn, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: w, kCVPixelBufferHeightKey as String: h])
writer.add(vIn)

let aSettings: [String: Any] = [AVFormatIDKey: kAudioFormatMPEG4AAC, AVNumberOfChannelsKey: 2, AVSampleRateKey: 44100, AVEncoderBitRateKey: 160_000]
let aIn = AVAssetWriterInput(mediaType: .audio, outputSettings: aSettings)
aIn.expectsMediaDataInRealTime = false
writer.add(aIn)

let asset = AVURLAsset(url: URL(fileURLWithPath: a[2]))
let reader = try AVAssetReader(asset: asset)
let track = asset.tracks(withMediaType: .audio)[0]
let rOut = AVAssetReaderTrackOutput(track: track, outputSettings: [
    AVFormatIDKey: kAudioFormatLinearPCM, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false,
    AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false, AVSampleRateKey: 44100, AVNumberOfChannelsKey: 2])
reader.add(rOut)
reader.startReading()

writer.startWriting()
writer.startSession(atSourceTime: .zero)

let frameBytes = w * h * 4
let stdin = FileHandle.standardInput
func readExactly(_ n: Int) -> Data? {
    var data = Data(capacity: n)
    while data.count < n {
        let chunk = stdin.readData(ofLength: n - data.count)
        if chunk.isEmpty { return nil }
        data.append(chunk)
    }
    return data
}

let audioDone = DispatchSemaphore(value: 0)
let audioQueue = DispatchQueue(label: "audio")
aIn.requestMediaDataWhenReady(on: audioQueue) {
    while aIn.isReadyForMoreMediaData {
        if let sb = rOut.copyNextSampleBuffer() { aIn.append(sb) }
        else { aIn.markAsFinished(); audioDone.signal(); return }
    }
}

var frame = 0
while frame < total {
    guard let raw = readExactly(frameBytes) else { break }
    while !vIn.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.005) }
    var pb: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
    guard let buf = pb else { fatalError("no pixel buffer") }
    CVPixelBufferLockBaseAddress(buf, [])
    let base = CVPixelBufferGetBaseAddress(buf)!
    let stride = CVPixelBufferGetBytesPerRow(buf)
    raw.withUnsafeBytes { src in
        for y in 0..<h { memcpy(base + y * stride, src.baseAddress! + y * w * 4, w * 4) }
    }
    CVPixelBufferUnlockBaseAddress(buf, [])
    adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(frame), timescale: fps))
    frame += 1
}
vIn.markAsFinished()
audioDone.wait()

let sem = DispatchSemaphore(value: 0)
writer.finishWriting { sem.signal() }
sem.wait()
if writer.status != .completed { FileHandle.standardError.write("failed: \(String(describing: writer.error))\n".data(using: .utf8)!); exit(1) }
print("wrote \(frame) frames → \(a[1])")
