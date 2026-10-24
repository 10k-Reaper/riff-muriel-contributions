import ActivityKit
import SwiftUI
import WidgetKit

// The lyrics Live Activity: the line being sung on the lock screen and in the Dynamic Island.
// The app keeps it up to date (App/LyricsLiveActivity.swift); this only draws it.
@main
struct MurielWidgets: WidgetBundle {
    var body: some Widget {
        MurielLyricsLiveActivity()
    }
}

private let pink = Color(red: 1.0, green: 0.31, blue: 0.64)
private let violet = Color(red: 0.55, green: 0.36, blue: 0.96)

struct MurielLyricsLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: MurielLyricsAttributes.self) { context in
            LockScreenLyrics(state: context.state)
                .activityBackgroundTint(Color.black.opacity(0.5))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            let state = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Artwork(data: state.artwork, size: 50, radius: 12)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    PlayingMark(playing: state.playing, size: 17)
                        .padding(.trailing, 6)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(state.title)
                            .font(.system(size: 15, weight: .semibold))
                            .lineLimit(1)
                        Text(state.artist)
                            .font(.system(size: 13))
                            .foregroundColor(.white.opacity(0.6))
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    LyricLines(state: state, big: 19, small: 14)
                        .padding(.horizontal, 4)
                        .padding(.top, 6)
                }
            } compactLeading: {
                Artwork(data: state.artwork, size: 24, radius: 7)
            } compactTrailing: {
                PlayingMark(playing: state.playing, size: 14)
            } minimal: {
                Artwork(data: state.artwork, size: 24, radius: 12)
            }
            .keylineTint(pink)
        }
    }
}

struct LockScreenLyrics: View {
    let state: MurielLyricsAttributes.ContentState

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Artwork(data: state.artwork, size: 58, radius: 14)
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    Text(header)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white.opacity(0.62))
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    PlayingMark(playing: state.playing, size: 13)
                }
                LyricLines(state: state, big: 20, small: 15)
            }
        }
        .padding(16)
    }

    private var header: String {
        hasLyrics ? [state.title, state.artist].filter { !$0.isEmpty }.joined(separator: " · ") : "Muriel"
    }

    private var hasLyrics: Bool { !state.line.isEmpty || !state.next.isEmpty }
}

// the line being sung, big, and the one after it, dimmed. Without synced lyrics: the song itself.
struct LyricLines: View {
    let state: MurielLyricsAttributes.ContentState
    let big: CGFloat
    let small: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if state.line.isEmpty && state.next.isEmpty {
                Text(state.title.isEmpty ? "Muriel" : state.title)
                    .font(.system(size: big, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                    .lineLimit(2)
                if !state.artist.isEmpty {
                    Text(state.artist)
                        .font(.system(size: small, weight: .medium, design: .rounded))
                        .foregroundColor(.white.opacity(0.55))
                        .lineLimit(1)
                }
            } else {
                Text(state.line.isEmpty ? "♪" : state.line)
                    .font(.system(size: big, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.75)
                    .contentTransition(.opacity)
                if !state.next.isEmpty {
                    Text(state.next)
                        .font(.system(size: small, weight: .semibold, design: .rounded))
                        .foregroundColor(.white.opacity(0.42))
                        .lineLimit(1)
                        .contentTransition(.opacity)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct PlayingMark: View {
    let playing: Bool
    let size: CGFloat

    var body: some View {
        Image(systemName: playing ? "waveform" : "pause.fill")
            .font(.system(size: size, weight: .semibold))
            .foregroundColor(playing ? pink : .white.opacity(0.6))
    }
}

struct Artwork: View {
    let data: Data?
    let size: CGFloat
    let radius: CGFloat

    var body: some View {
        Group {
            if let data = data, let image = UIImage(data: data) {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                ZStack {
                    LinearGradient(colors: [pink, violet], startPoint: .topLeading, endPoint: .bottomTrailing)
                    Image(systemName: "sparkles")
                        .font(.system(size: size * 0.42, weight: .semibold))
                        .foregroundColor(.white)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}
