## Muriel 1.2.8

**Downloads**
- **iPhone:** [ios-latest](https://github.com/cloverscripts/riff-muriel/releases/tag/ios-latest) (`Muriel.ipa`, install with SideStore, AltStore or Sideloadly). Needs iOS 16.2 or newer
- **Android:** [android-latest](https://github.com/cloverscripts/riff-muriel/releases/tag/android-latest) (`Muriel.apk`)
- **Windows:** installer below, or the portable exe on [windows-latest](https://github.com/cloverscripts/riff-muriel/releases/tag/windows-latest)
- **macOS:** `.dmg` / `.zip` below, for Apple Silicon and Intel. The app is unsigned: if macOS blocks it, open System Settings → Privacy & Security → Open Anyway.
- **Linux:** `.AppImage` below (needs FUSE 2: `fuse2` / `libfuse2`)

Or get it from the website: https://cloverscripts.github.io/riff-muriel/

**Fixed**
- **Songs that wouldn't play (Android, Spotify imports):** a SoundCloud or YouTube Music song that fails now tries the same song on YouTube before giving up. SoundCloud songs that are only offered as a stream play since 1.2.6.
- **Spotify import:** songs are no longer matched to a remix, cover, sped-up or bootleg upload when the Spotify song is the original
- **Downloads on Android:** downloaded songs are now saved to **Music/Muriel**, where your file manager and music apps can find them (before, they were hidden inside the app). Songs you downloaded earlier move there automatically. Android 10 and older ask for storage access once.
- **Artists with the same name:** tapping an artist now opens that exact artist instead of the best-known one with the same name. The artist page also shows other artists with that name, one tap away.
- **Error log:** when a song can't load, the shared error log now says why

Everything from 1.2.7 is included too: shorter share links, the web player, Opus audio on Android and full-quality YouTube on desktop.
