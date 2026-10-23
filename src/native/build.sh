#!/bin/sh
# Builds the dictation helper as a tiny app bundle: macOS only shows its permission
# prompts (microphone, speech recognition) for something with a bundle and a name.
set -e
cd "$(dirname "$0")/../.."
app=out/native/SlashCodeDictee.app
mkdir -p "$app/Contents/MacOS"
cp src/native/Info.plist "$app/Contents/Info.plist"
swiftc -O src/native/dictate.swift -o "$app/Contents/MacOS/slashcode-dictate"
codesign --force -s - "$app"
