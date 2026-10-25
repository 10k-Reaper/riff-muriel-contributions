## Muriel 1.1.5

**Downloads**
- **iPhone:** [ios-latest](https://github.com/cloverscripts/riff-muriel/releases/tag/ios-latest) (`Muriel.ipa`, install with SideStore, AltStore or Sideloadly)
- **Android:** [android-latest](https://github.com/cloverscripts/riff-muriel/releases/tag/android-latest) (`Muriel.apk`)
- **Windows:** installer below, or the portable exe on [windows-latest](https://github.com/cloverscripts/riff-muriel/releases/tag/windows-latest)
- **macOS:** `.dmg` / `.zip` below, for Apple Silicon and Intel. The app is unsigned: if macOS blocks it, open System Settings → Privacy & Security → Open Anyway.
- **Linux:** `.AppImage` below (needs FUSE 2: `fuse2` / `libfuse2`)

Or get it from the website: https://cloverscripts.github.io/riff-muriel/

**Fixed**
- **Music keeps playing in the background** on Android and iPhone. Between two songs, while the next one was still loading, the phone could put Muriel to sleep, and the next song only started once you opened the app again
- **iPhone lock screen** shows previous / next track again instead of the ±15 second skip buttons ([#1](https://github.com/cloverscripts/riff-muriel/issues/1))
- **Album pages** scroll down to the tracks on phones instead of getting stuck on the cover ([#2](https://github.com/cloverscripts/riff-muriel/issues/2))
- **Black text on some Android phones** (older system WebView, e.g. Huawei and Honor phones without Google services): text is readable again ([#3](https://github.com/cloverscripts/riff-muriel/issues/3))
- **Adding FLAC files** on phones no longer crashes the app, even with several big files at once

**New**
- **Android:** a "Play in the background" switch in Settings lets Muriel off battery saving, for phones that close apps in the background even while music plays (Muriel also asks once, when the first song starts)

Everything from 1.1.4 is included too: songs no longer stop at 0:29, playlists skip songs that can't load, lyrics on the iPhone lock screen and in the Dynamic Island, Android notification and lock-screen controls.
