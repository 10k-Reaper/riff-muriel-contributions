import UIKit
import AVFoundation
import WebKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Music app: keep playing with the screen locked or the app in the background,
        // and ignore the silent switch. The session is not activated here: that would stop other
        // apps' audio the moment Muriel opens; WebKit activates it when a song starts.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // the lyrics Live Activity can't follow the song once the app is gone
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) { LyricsActivity.shared.endAllBeforeExit() }
        #endif
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}


// Muriel's web view. WebKit has a (private) preference that mutes a page's audio while the page
// is hidden: playback keeps "running" and shows on the lock screen, but nothing is audible once the
// app is backgrounded or the phone is locked. Turn it off, if this iOS version has it.
class MurielBridgeViewController: CAPBridgeViewController {
    override open func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        if config.preferences.responds(to: NSSelectorFromString("_setRequiresPageVisibilityToPlayAudio:")) {
            config.preferences.setValue(false, forKey: "requiresPageVisibilityToPlayAudio")
        }
        return config
    }

    // plugins that live in the app itself (not in an npm package) are registered by hand
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(MurielLiveActivityPlugin())
    }
}
