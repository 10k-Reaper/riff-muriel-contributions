## Muriel 1.1.1

A stability update: the whole app was clicked through on phone and desktop and the API was stress-tested, and everything that broke is fixed.

**Downloads**
- **iPhone:** [ios-latest](https://github.com/cloverscripts/riff-muriel/releases/tag/ios-latest) (`Muriel.ipa`, install with SideStore, AltStore or Sideloadly)
- **Android:** [android-latest](https://github.com/cloverscripts/riff-muriel/releases/tag/android-latest) (`Muriel.apk`)
- **Windows:** installer below, or the portable exe on [windows-latest](https://github.com/cloverscripts/riff-muriel/releases/tag/windows-latest)
- **macOS:** `.dmg` / `.zip` below, for Apple Silicon and Intel. The app is unsigned: right-click → Open the first time.
- **Linux:** `.AppImage` below

**Phone**
- Scrolling Favorites or a playlist no longer reorders songs; hold a song, then drag, to move it
- Hold a song to open its menu (works on iPhone now)
- "New playlist" in the add-to-playlist dialog puts the song in it and keeps you where you were
- Select (multi-select) is back on Favorites, and its button bar fits the screen
- Playlist header and the tablet search bar fit the screen
- Lyrics keep working when you skip through songs quickly
- Your own music files show their length

**Desktop**
- On a first install the home page loads by itself once setup has finished
- Removed a Discord switch from the welcome screen that did nothing

**Under the hood**
- No more requests that hang forever or crash the app on odd input, dropped connections or unreadable files
- Failed lookups (lyrics, Hot picks, artist pages, albums) are retried later instead of staying empty until restart
- Memory stays flat over long sessions; seeking closes the old audio connection right away
- A crash while saving can no longer wipe your music library
- YouTube Music shows music videos in countries where it has no songs
- Translation gives up quickly when the service is down
- Security: imports only fetch what they should and need the app's token
