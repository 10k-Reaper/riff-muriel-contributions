# Muriel

A lightweight desktop music player for Windows, Linux and macOS. Stream from YouTube, YouTube Music and SoundCloud, download for offline listening, and keep a local library — no account, no subscription.

Muriel is based on [Riff](https://github.com/rootscripts/riff) by rootscripts (MIT).

## Features

- **Streaming & downloads** — YouTube, YouTube Music and SoundCloud via yt-dlp and ffmpeg (installed automatically on first run)
- **Local library** — reads tags and album art, folders and playlists, original files stay untouched
- **Lyrics** — online synced lyrics, LRC files, manual timing, fullscreen karaoke
- **Audio** — EQ, presets, real-time speed, reverb, and a small editor for trimming and exporting clips
- **Compact layout** — slim navigation rail, slide-over drawer for now playing, lyrics and the queue
- **Custom background** — image, GIF or video, with optional glass blur on the interface; pauses while Muriel is hidden
- **Performance settings** — lightweight thumbnails, blur on/off, visualizer frame-rate cap, memory trimming in the background, hardware acceleration toggle

## Getting started

Requires Node.js 18 or newer.

```bash
git clone https://github.com/cloverscripts/riff-muriel.git
cd riff-muriel
npm install
npm start
```

## Building

```bash
npm run dist
```

Installers land in `dist/`. Builds are unsigned: on macOS, right-click Muriel in Applications and choose Open; if macOS says the app is damaged, run `xattr -cr /Applications/Muriel.app`.

## Data

- Windows: `%LOCALAPPDATA%\Muriel`
- macOS: `~/Library/Application Support/Muriel`
- Linux: `~/.cache/muriel` (settings in `~/.config/muriel`)

## License

MIT. See [LICENSE](LICENSE). Original Riff code © rootscripts.
