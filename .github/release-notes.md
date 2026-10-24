## Muriel 1.1.3

**Downloads**
- **iPhone:** [ios-latest](https://github.com/cloverscripts/riff-muriel/releases/tag/ios-latest) (`Muriel.ipa`, install with SideStore, AltStore or Sideloadly)
- **Android:** [android-latest](https://github.com/cloverscripts/riff-muriel/releases/tag/android-latest) (`Muriel.apk`)
- **Windows:** installer below, or the portable exe on [windows-latest](https://github.com/cloverscripts/riff-muriel/releases/tag/windows-latest)
- **macOS:** `.dmg` / `.zip` below, for Apple Silicon and Intel. The app is unsigned: if macOS blocks it, open System Settings → Privacy & Security → Open Anyway.
- **Linux:** `.AppImage` below (needs FUSE 2: `fuse2` / `libfuse2`)

Or get it from the website: https://cloverscripts.github.io/riff-muriel/

**Fixed**
- **Songs stopping at 0:29:** when YouTube refused a song, Muriel fell back to SoundCloud and could pick its 30-second preview. It now only takes a full upload of the same song, and previews cached before are deleted, so those songs load properly again
- **Player:** shuffle no longer repeats the song that's playing and plays "Play next" songs first; starting an album from a song continues with the next track; a song that can't be played shows an error instead of an endless spinner; the "end of track" sleep timer works with crossfade, and the minutes timer stops the music even when minimized; Normalize volume works
- **Library:** dragging songs in a long list moves the right one; "Select all" only selects what your search shows; removing one copy of a song that's in a playlist twice keeps the other; big playlists open and filter without freezing
- **Lyrics** you edit or sync are saved to the right song and keep their timestamps
- **Imports** from Spotify and Apple Music files don't leave half-made or duplicate playlists, and a playlist download can be cancelled
- When storage is full, Muriel frees space and tells you instead of failing silently
- "Reset audio settings" works, and the theme you pick on the welcome screen is kept

**New**
- **iPhone:** lyrics on the lock screen and in the Dynamic Island (Settings → Tracks → Lyrics on lock screen)
- **Android:** play/pause/skip, cover and seek bar in the notification, on the lock screen and in the quick-settings media player; headset buttons work, and the music no longer stops in the background
- **Battery saver** switch (Settings → Interface)

**Safer**
- Muriel's built-in server only answers Muriel itself (web pages could reach it before), checks HTTPS certificates when downloading, and only loads its own pages
