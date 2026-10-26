## Muriel 1.3.4

**Downloads**
- **iPhone:** [ios-latest](https://github.com/cloverscripts/riff-muriel/releases/tag/ios-latest) (`Muriel.ipa`, install with SideStore, AltStore or Sideloadly). Needs iOS 16.2 or newer
- **Android:** [android-latest](https://github.com/cloverscripts/riff-muriel/releases/tag/android-latest) (`Muriel.apk`)
- **Windows:** installer below, or the portable exe on [windows-latest](https://github.com/cloverscripts/riff-muriel/releases/tag/windows-latest)
- **macOS:** `.dmg` / `.zip` below, for Apple Silicon and Intel. The app is unsigned: if macOS blocks it, open System Settings → Privacy & Security → Open Anyway.
- **Linux:** `.AppImage` below (needs FUSE 2: `fuse2` / `libfuse2`)

Or get it from the website: https://cloverscripts.github.io/riff-muriel/

**New**
- **Per-song sound:** in Audio → Tempo, "For this track only" keeps speed, pitch and volume for one song. "Ignore per-track settings" plays everything with the global values again, without deleting what songs saved.
- **Speed & pitch presets:** Normal, Slowed, Daycore, Sped up, Nightcore and Practice, plus your own.
- **Artists tab:** the artists you follow in one grid (turn it on in Settings).

**Fixed**
- **SoundCloud:** share links (on.soundcloud.com, m.soundcloud.com) import again. Search no longer shows songs that SoundCloud only streams encrypted, which never played.
- **Favorites:** the same song can't end up in favorites twice any more; existing duplicates are cleaned up.
- **Home rows:** the mouse wheel scrolls the artists and playlists rows instead of the whole page.
- **Copy diagnostics and the logs button** work again, on phones too.
- **Google login:** when Google refuses the sign-in, Muriel now says why and suggests importing playlists by link.

**Fixed in 1.3.3**
- **Settings on phones:** the page sat shifted to the right and was cut off at the edge. It fits the screen again, at any font size.

**Fixed in 1.3.2**
- **Yandex Music import:** shared playlist links (music.yandex.ru/playlists/lk.…) are read now. When Yandex refuses, the message says why, instead of "Spotify doesn't allow reading this playlist".
- **Import dialog:** its title and menu follow the app's language

**Changed in 1.3.1**
- **Last.fm:** connecting is now just a login, so you no longer need your own API key

**New in 1.3** (everything new in Riff 43)
- **Muriel in your language:** Settings → Interface → Language. Song titles, artists and playlist names are never sent for translation.
- **Last.fm scrobbling:** each profile has its own login
- **Import and back up:**
  - **YouTube library (desktop):** sign in with Google and import your liked songs and playlists from YouTube and YouTube Music.
  - **Yandex Music:** import playlists.
  - **Playlist files:** import and export playlists as files that work with Riff.
  - **Profile backup:** back up and restore a profile.
- **Albums:** save albums to a new Albums tab (turn it on in Settings).
- **Artist pages:** a new design with a big header, follow button, bio and Songs/Albums tabs. Followed artists show up on the home page.
- **Spotify-style home (optional, Settings → Advanced):** quick picks, daily mixes you can rate, what's trending, and your artists.
- **Sorting and descriptions:** sort favorites and playlists, and give playlists a description.
- **Explicit [E] badges.**
- **Lyrics:**
  - **Source:** choose where they come from (LRCLIB or Genius).
  - **Word timing:** words light up in time with the song, where the timings are available.
  - **Mini lyrics:** lyrics in the mini player.
- **Trim the best part:** save a trimmed part of a song; playback jumps to it.
- **Look:**
  - **Visualizer:** it can sit behind the player bar.
  - **Icons:** icon packs and home button icons.
  - **Desktop:** a splash screen and a hideable title bar.
  - **Karaoke screen:** a seek bar.
- **Android islands:** on vivo phones with OriginOS 6 (Android 16) the song shows in the Origin Island. It also works on OPPO, OnePlus, realme and Honor (turn it on in Settings) and in the status bar on other Android 16 phones.

**Fixed**
- **Mini player:** a tap just under the song title opened the artist instead of Now Playing.
- **Artist lookups:** searching by name now finds the exact artist (for example "Queen"), and disambiguation pages are no longer shown as a bio.
- **Stuck songs:** a song that loads nothing for 12 seconds is skipped (adjustable in Settings).

Everything from 1.2.9 is included too: profiles, songs that wouldn't play trying YouTube, downloads in Music/Muriel on Android, and the right artist when several share a name.
