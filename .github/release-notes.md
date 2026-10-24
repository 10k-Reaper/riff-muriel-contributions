## Muriel 1.1.4

**Downloads**
- **iPhone:** [ios-latest](https://github.com/cloverscripts/riff-muriel/releases/tag/ios-latest) (`Muriel.ipa`, install with SideStore, AltStore or Sideloadly)
- **Android:** [android-latest](https://github.com/cloverscripts/riff-muriel/releases/tag/android-latest) (`Muriel.apk`)
- **Windows:** installer below, or the portable exe on [windows-latest](https://github.com/cloverscripts/riff-muriel/releases/tag/windows-latest)
- **macOS:** `.dmg` / `.zip` below, for Apple Silicon and Intel. The app is unsigned: if macOS blocks it, open System Settings → Privacy & Security → Open Anyway.
- **Linux:** `.AppImage` below (needs FUSE 2: `fuse2` / `libfuse2`)

Or get it from the website: https://cloverscripts.github.io/riff-muriel/

**Fixed**
- **Playlists stopping:** a song that couldn't be loaded stopped the whole playlist. In playlists, favorites, albums, the queue and after Next it's now skipped with a short message, and the next song plays
- **Shuffle** downloads the song it will actually play next, so shuffled songs start right away (and the iPhone doesn't pause Muriel in the gap with the screen locked)
- **Search bar:** text no longer runs out of the box and under the source buttons on phones

**New**
- A legal notice in Settings → About and in the download window: Muriel is an independent, non-commercial player, hosts no music, and isn't affiliated with YouTube, Google, SoundCloud or Spotify. Rights holders can reach us through [a form on GitHub](https://github.com/cloverscripts/riff-muriel/issues/new?template=rights-holder-request.yml); details in [LEGAL.md](https://github.com/cloverscripts/riff-muriel/blob/main/LEGAL.md)

Everything from 1.1.3 is included too: songs no longer stop at 0:29, lyrics on the iPhone lock screen and in the Dynamic Island, Android notification and lock-screen controls, and many player and library fixes.
