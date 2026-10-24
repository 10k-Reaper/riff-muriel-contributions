import Foundation
#if canImport(ActivityKit)
import ActivityKit

// The lyrics Live Activity (lock screen and Dynamic Island). Compiled into both the app, which updates
// it (LyricsLiveActivity.swift), and the MurielWidgets extension, which draws it.
// A Live Activity can only be started while the app is open, so one activity follows the whole
// listening session and everything that changes per song lives in the content state.
@available(iOS 16.1, *)
struct MurielLyricsAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var title: String
        var artist: String
        /// the line being sung now; empty before the first line or without synced lyrics
        var line: String
        var next: String
        var playing: Bool
        /// small JPEG cover; the whole activity has to stay under 4 KB
        var artwork: Data?
    }
}
#endif
