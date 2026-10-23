// SlashCode dictation helper: turns the microphone into text with Apple's speech
// recognition, on the Mac itself. macOS 26+ uses SpeechAnalyzer (no need for Siri or
// the system Dictation to be on); older systems fall back to SFSpeechRecognizer.
//
// Usage: slashcode-dictate [--lang fr-FR] [--file audio.wav]
// Writes one JSON object per line on stdout:
//   {"type":"installing"} {"type":"ready"} {"type":"level","value":0.42}
//   {"type":"partial","text":"…"} {"type":"final","text":"…"} {"type":"error","code":"…","message":"…"}
// A line "stop" on stdin (or closing stdin) ends the dictation and flushes the final text.

import AVFoundation
import Foundation
import Speech

// macOS asks the "responsible" app for privacy permissions, which is whatever launched
// SlashCode (a terminal in dev). Re-exec once as our own responsible process so the
// prompt and the usage descriptions are this helper's.
@_silgen_name("responsibility_spawnattrs_setdisclaim")
func responsibility_spawnattrs_setdisclaim(_ attrs: UnsafeMutablePointer<posix_spawnattr_t?>, _ disclaim: Int32) -> Int32

if getenv("SLASHCODE_DICTATE_OWN") == nil, let exe = Bundle.main.executablePath {
  setenv("SLASHCODE_DICTATE_OWN", "1", 1)
  var attr: posix_spawnattr_t?
  posix_spawnattr_init(&attr)
  _ = responsibility_spawnattrs_setdisclaim(&attr, 1)
  posix_spawnattr_setflags(&attr, Int16(POSIX_SPAWN_SETEXEC))
  var argv: [UnsafeMutablePointer<CChar>?] = CommandLine.arguments.map { strdup($0) }
  argv[0] = strdup(exe)
  argv.append(nil)
  var pid: pid_t = 0
  posix_spawn(&pid, exe, nil, &attr, argv, environ)
  // Only reached if the re-exec failed: carry on as we are.
}

setvbuf(stdout, nil, _IOLBF, 0)

func emit(_ obj: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: obj),
    let line = String(data: data, encoding: .utf8)
  else { return }
  print(line)
}

func fail(_ code: String, _ message: String) -> Never {
  emit(["type": "error", "code": code, "message": message])
  exit(1)
}

var lang = "fr-FR"
var file: String?
var args = CommandLine.arguments.dropFirst().makeIterator()
while let a = args.next() {
  if a == "--lang", let v = args.next() { lang = v }
  if a == "--file", let v = args.next() { file = v }
}

let engine = AVAudioEngine()
var lastText = ""
var finished = false
var stopping = false
var onStop: () -> Void = {}

func finish() {
  if finished { return }
  finished = true
  emit(["type": "final", "text": lastText])
  exit(0)
}

func stop() {
  DispatchQueue.main.async {
    if stopping { return }
    stopping = true
    if engine.isRunning {
      engine.stop()
      engine.inputNode.removeTap(onBus: 0)
    }
    onStop()
    // Recognition normally ends a moment after the audio; never hang on it.
    DispatchQueue.main.asyncAfter(deadline: .now() + 3) { finish() }
  }
}

var lastLevel = Date.distantPast

/** Microphone level for the meter, roughly -50 dB … 0 dB mapped to 0 … 1. */
func reportLevel(_ buffer: AVAudioPCMBuffer) {
  let now = Date()
  guard now.timeIntervalSince(lastLevel) > 0.08, let samples = buffer.floatChannelData?[0] else { return }
  lastLevel = now
  var sum: Float = 0
  let n = Int(buffer.frameLength)
  for i in 0..<n { sum += samples[i] * samples[i] }
  let rms = n > 0 ? sqrt(sum / Float(n)) : 0
  let level = max(0, min(1, (20 * log10(max(rms, 1e-6)) + 50) / 50))
  emit(["type": "level", "value": (Double(level) * 100).rounded() / 100])
}

func micFormat() -> AVAudioFormat {
  let format = engine.inputNode.outputFormat(forBus: 0)
  guard format.channelCount > 0 else { fail("mic", "Aucun micro n’est disponible.") }
  return format
}

func startMic() {
  engine.prepare()
  do {
    try engine.start()
  } catch {
    fail("mic", "Le micro n’a pas pu démarrer : \(error.localizedDescription)")
  }
}

/* ---------------- macOS 26+: SpeechAnalyzer ---------------- */

@available(macOS 26.0, *)
func runAnalyzer() async {
  guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: lang)) else {
    fail("lang", "La langue \(lang) n’est pas prise en charge par la dictée.")
  }
  let transcriber = SpeechTranscriber(
    locale: locale, transcriptionOptions: [], reportingOptions: [.volatileResults], attributeOptions: [])
  do {
    if let install = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
      emit(["type": "installing"])
      try await install.downloadAndInstall()
    }
  } catch {
    fail("install", "Le modèle de reconnaissance n’a pas pu être téléchargé : \(error.localizedDescription)")
  }

  let analyzer = SpeechAnalyzer(modules: [transcriber])
  var settled = ""  // finished phrases
  let results = Task {
    do {
      for try await result in transcriber.results {
        let text = String(result.text.characters)
        let joined = settled.isEmpty || text.first?.isWhitespace == true ? settled + text : settled + " " + text
        if result.isFinal { settled = joined }
        lastText = joined.trimmingCharacters(in: .whitespacesAndNewlines)
        emit(["type": "partial", "text": lastText])
      }
    } catch {
      if lastText.isEmpty && !stopping { fail("recognition", error.localizedDescription) }
    }
  }

  do {
    if let file {
      let audio = try AVAudioFile(forReading: URL(fileURLWithPath: file))
      emit(["type": "ready", "engine": "analyzer"])
      try await analyzer.start(inputAudioFile: audio, finishAfterFile: true)
    } else {
      guard let target = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
        fail("format", "Format audio non pris en charge.")
      }
      let source = micFormat()
      guard let converter = AVAudioConverter(from: source, to: target) else {
        fail("format", "Conversion audio impossible.")
      }
      let (stream, input) = AsyncStream<AnalyzerInput>.makeStream()
      engine.inputNode.installTap(onBus: 0, bufferSize: 4096, format: source) { buffer, _ in
        reportLevel(buffer)
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * target.sampleRate / source.sampleRate) + 64
        guard let out = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return }
        var given = false
        var error: NSError?
        converter.convert(to: out, error: &error) { _, status in
          if given {
            status.pointee = .noDataNow
            return nil
          }
          given = true
          status.pointee = .haveData
          return buffer
        }
        if out.frameLength > 0 { input.yield(AnalyzerInput(buffer: out)) }
      }
      try await analyzer.start(inputSequence: stream)
      onStop = {
        input.finish()
        Task {
          try? await analyzer.finalizeAndFinishThroughEndOfInput()
          _ = await results.result
          DispatchQueue.main.async { finish() }
        }
      }
      startMic()
      emit(["type": "ready", "engine": "analyzer"])
      return
    }
  } catch {
    fail("recognition", error.localizedDescription)
  }
  _ = await results.result
  DispatchQueue.main.async { finish() }
}

/* ---------------- older systems: SFSpeechRecognizer ---------------- */

var legacyTask: SFSpeechRecognitionTask?

func runLegacy() {
  guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: lang)) else {
    fail("lang", "La langue \(lang) n’est pas prise en charge par la dictée.")
  }
  guard recognizer.isAvailable else {
    fail("unavailable", "La reconnaissance vocale n’est pas disponible pour le moment.")
  }
  let req: SFSpeechRecognitionRequest
  if let file {
    req = SFSpeechURLRecognitionRequest(url: URL(fileURLWithPath: file))
  } else {
    let buffered = SFSpeechAudioBufferRecognitionRequest()
    engine.inputNode.installTap(onBus: 0, bufferSize: 1024, format: micFormat()) { buffer, _ in
      buffered.append(buffer)
      reportLevel(buffer)
    }
    onStop = { buffered.endAudio() }
    startMic()
    req = buffered
  }
  req.shouldReportPartialResults = true
  req.addsPunctuation = true
  if recognizer.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true }

  legacyTask = recognizer.recognitionTask(with: req) { result, error in
    DispatchQueue.main.async {
      if let result {
        lastText = result.bestTranscription.formattedString
        if result.isFinal { return finish() }
        emit(["type": "partial", "text": lastText])
      }
      if let error {
        // "No speech detected" and cancellations after a stop are not worth reporting.
        if stopping || !lastText.isEmpty { return finish() }
        let message = (error as NSError).code == 201
          ? "Active « Dictée » dans Réglages Système > Clavier pour utiliser la reconnaissance vocale."
          : error.localizedDescription
        fail("recognition", message)
      }
    }
  }
  emit(["type": "ready", "engine": "legacy"])
}

/* ---------------- start ---------------- */

func start() {
  if #available(macOS 26.0, *), SpeechTranscriber.isAvailable {
    Task { await runAnalyzer() }
  } else {
    SFSpeechRecognizer.requestAuthorization { status in
      guard status == .authorized else {
        fail(
          "speech-denied",
          "La reconnaissance vocale est refusée. Autorise SlashCode Dictée dans Réglages Système > Confidentialité et sécurité > Reconnaissance vocale."
        )
      }
      DispatchQueue.main.async { runLegacy() }
    }
  }
}

// Commands from SlashCode (a file is simply read to the end).
if file == nil {
  Thread.detachNewThread {
    while let line = readLine() {
      if line.trimmingCharacters(in: .whitespaces) == "stop" { break }
    }
    stop()
  }
  AVCaptureDevice.requestAccess(for: .audio) { granted in
    guard granted else {
      fail(
        "mic-denied",
        "L’accès au micro est refusé. Autorise SlashCode Dictée dans Réglages Système > Confidentialité et sécurité > Micro."
      )
    }
    DispatchQueue.main.async { start() }
  }
} else {
  start()
}

dispatchMain()
