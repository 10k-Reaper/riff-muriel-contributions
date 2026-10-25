package io.github.cloverscripts.muriel;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import androidx.activity.result.ActivityResult;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The phone's "now playing" controls for Android: a media session plus a playback notification, so
 * Muriel shows up in the notification shade, on the lock screen and in the quick-settings media
 * player, and headset / Bluetooth buttons work. Android's WebView doesn't do this for the page's
 * navigator.mediaSession the way iOS does. The page (mobile/media-controls.js) sends the song and
 * play state; button presses come back as "action" events.
 *
 * While a song plays, PlaybackService keeps the app in the foreground, so Android doesn't stop the
 * music in the background to save memory. Between two songs nothing plays while the next one downloads;
 * the page reports that as "loading", and the app stays in the foreground and awake for it.
 */
@CapacitorPlugin(name = "MurielMedia")
public class MediaControlsPlugin extends Plugin {
    static final String CHANNEL = "playback";
    static final int NOTIFICATION_ID = 7041;
    static final int ART_SIZE = 320;
    // paused: CPU and Wi-Fi are let go after this
    static final long LOCK_RELEASE_MS = 15_000;
    // re-taken on every update while playing; only a page that stopped talking lets it run out
    static final long WAKE_LOCK_MS = 30 * 60 * 1000;

    // read by PlaybackService
    static volatile MediaControlsPlugin instance;
    static volatile Notification notification;
    // a song is playing or the next one is on its way
    static volatile boolean playing;

    private MediaSessionCompat session;
    private final ExecutorService artLoader = Executors.newSingleThreadExecutor();
    private String title = "";
    private String artist = "";
    private String album = "";
    private long durationMs = 0;
    private String artworkUrl = "";
    private Bitmap artwork;
    // the extra buttons beside previous / next (Android 13+: in the quick-settings and lock-screen player)
    static final String CUSTOM_SHUFFLE = "io.github.cloverscripts.muriel.SHUFFLE";
    static final String CUSTOM_REPEAT = "io.github.cloverscripts.muriel.REPEAT";
    private boolean shuffle;
    private boolean repeat;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable releaseLater = this::releaseLocks;

    @Override
    public void load() {
        instance = this;
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Playback", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("The song that's playing, with play, pause and skip");
            channel.setShowBadge(false);
            ctx.getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
        session = new MediaSessionCompat(ctx, "Muriel");
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { start("play"); }
            @Override public void onPause() { send("pause", -1); }
            @Override public void onStop() { send("pause", -1); }
            @Override public void onSkipToNext() { start("next"); }
            @Override public void onSkipToPrevious() { start("prev"); }
            @Override public void onSeekTo(long pos) { send("seek", pos / 1000.0); }
            @Override public void onCustomAction(String action, android.os.Bundle extras) {
                if (CUSTOM_SHUFFLE.equals(action)) send("shuffle", -1);
                else if (CUSTOM_REPEAT.equals(action)) send("repeat", -1);
            }
        });
    }

    void send(String action, double position) {
        JSObject data = new JSObject();
        data.put("action", action);
        if (position >= 0) data.put("position", position);
        notifyListeners("action", data);
    }

    // play / next / previous from the notification, the lock screen or a headset: each starts a song.
    // Paused for a while, Muriel may no longer be in the foreground, and Android 15+ only lets apps in the
    // foreground play (the song stopped again right away). Such a button press may bring the app back into
    // the foreground, so that happens first.
    void start(String action) {
        if (!playing) {
            playing = true;
            holdLocks();
            refreshNotification();
        }
        send(action, -1);
    }

    @PluginMethod
    public void update(PluginCall call) {
        title = call.getString("title", "");
        artist = call.getString("artist", "");
        album = call.getString("album", "");
        durationMs = (long) (call.getDouble("duration", 0.0) * 1000);
        long positionMs = (long) (call.getDouble("position", 0.0) * 1000);
        boolean nowPlaying = Boolean.TRUE.equals(call.getBoolean("playing", false));
        boolean loading = !nowPlaying && Boolean.TRUE.equals(call.getBoolean("loading", false));
        float rate = call.getFloat("rate", 1f);
        shuffle = Boolean.TRUE.equals(call.getBoolean("shuffle", false));
        repeat = Boolean.TRUE.equals(call.getBoolean("repeat", false));
        String art = call.getString("artwork", "");
        if (art == null) art = "";
        if (!art.equals(artworkUrl)) {
            artworkUrl = art;
            artwork = null;
            loadArtwork(art);
        }
        playing = nowPlaying || loading;
        if (playing) holdLocks();
        else {
            handler.removeCallbacks(releaseLater);
            handler.postDelayed(releaseLater, LOCK_RELEASE_MS);
        }

        session.setMetadata(metadata());
        session.setPlaybackState(new PlaybackStateCompat.Builder()
                .setActions(PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE
                        | PlaybackStateCompat.ACTION_PLAY_PAUSE | PlaybackStateCompat.ACTION_STOP
                        | PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                        | PlaybackStateCompat.ACTION_SEEK_TO)
                .setState(nowPlaying ? PlaybackStateCompat.STATE_PLAYING
                                : loading ? PlaybackStateCompat.STATE_BUFFERING : PlaybackStateCompat.STATE_PAUSED,
                        positionMs, nowPlaying ? rate : 0f)
                // shuffle goes left of "previous", repeat right of "next"; lit when on
                .addCustomAction(new PlaybackStateCompat.CustomAction.Builder(CUSTOM_SHUFFLE,
                        shuffle ? "Shuffle on" : "Shuffle off", shuffle ? R.drawable.ic_shuffle_on : R.drawable.ic_shuffle_off).build())
                .addCustomAction(new PlaybackStateCompat.CustomAction.Builder(CUSTOM_REPEAT,
                        repeat ? "Repeat on" : "Repeat off", repeat ? R.drawable.ic_repeat_one_on : R.drawable.ic_repeat_off).build())
                .build());
        session.setActive(true);
        refreshNotification();
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        shutdown();
        call.resolve();
    }

    // Some phones (Xiaomi, Huawei, Samsung's "sleeping apps"...) stop background apps to save battery even
    // while they play music, unless the app is let off battery optimization.
    @PluginMethod
    public void backgroundStatus(PluginCall call) {
        JSObject r = new JSObject();
        r.put("unrestricted", unrestricted());
        call.resolve(r);
    }

    // answers once the system dialog is closed
    @PluginMethod
    public void allowBackground(PluginCall call) {
        if (unrestricted() || getActivity() == null) { backgroundStatus(call); return; }
        try {
            startActivityForResult(call, new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + getContext().getPackageName())), "backgroundAnswered");
        } catch (Exception e) {
            // no such dialog on this phone: the list in Settings instead
            try { getActivity().startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); } catch (Exception ignored) {}
            getBridge().releaseCall(call);
            backgroundStatus(call);
        }
    }

    @ActivityCallback
    private void backgroundAnswered(PluginCall call, ActivityResult result) {
        if (call == null) return;
        getBridge().releaseCall(call);
        backgroundStatus(call);
    }

    private boolean unrestricted() {
        PowerManager pm = getContext().getSystemService(PowerManager.class);
        return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    // with the screen off the phone would otherwise sleep (and slow Wi-Fi down) while the next song downloads
    @SuppressWarnings("deprecation")
    private synchronized void holdLocks() {
        handler.removeCallbacks(releaseLater);
        Context app = getContext().getApplicationContext();
        try {
            if (wakeLock == null) {
                wakeLock = app.getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Muriel:playback");
                wakeLock.setReferenceCounted(false);
            }
            wakeLock.acquire(WAKE_LOCK_MS);
        } catch (Exception ignored) {}
        try {
            if (wifiLock == null) {
                wifiLock = ((WifiManager) app.getSystemService(Context.WIFI_SERVICE)).createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "Muriel:playback");
                wifiLock.setReferenceCounted(false);
            }
            if (!wifiLock.isHeld()) wifiLock.acquire();
        } catch (Exception ignored) {}
    }

    private synchronized void releaseLocks() {
        handler.removeCallbacks(releaseLater);
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception ignored) {}
        try { if (wifiLock != null && wifiLock.isHeld()) wifiLock.release(); } catch (Exception ignored) {}
    }

    private MediaMetadataCompat metadata() {
        MediaMetadataCompat.Builder b = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs);
        if (artwork != null) b.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artwork);
        return b.build();
    }

    // posts the notification; while playing, the service holds it as its foreground notification
    private synchronized void refreshNotification() {
        Context ctx = getContext();
        notification = buildNotification(ctx);
        Intent service = new Intent(ctx, PlaybackService.class).setAction(PlaybackService.ACTION_REFRESH);
        try {
            if (playing) ContextCompat.startForegroundService(ctx, service.putExtra(PlaybackService.EXTRA_FOREGROUND, true));
            else if (PlaybackService.running) ctx.startService(service);
            else ctx.getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, notification);
        } catch (Exception e) {
            // Android 12+ refuses to start a foreground service from the background (say, a headset
            // button while the app is closed); the notification still updates
            try { ctx.getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, notification); } catch (Exception ignored) {}
        }
    }

    private Notification buildNotification(Context ctx) {
        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        PendingIntent content = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_muriel)
                .setContentTitle(title)
                .setContentText(artist)
                .setLargeIcon(artwork)
                .setContentIntent(content)
                .setDeleteIntent(PlaybackService.intent(ctx, PlaybackService.ACTION_DISMISS, 4))
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setSilent(true)
                .setOngoing(playing)
                // Android 12 and older draw these buttons themselves; newer versions use the session's
                .addAction(shuffle ? R.drawable.ic_shuffle_on : R.drawable.ic_shuffle_off, shuffle ? "Shuffle on" : "Shuffle off",
                        PlaybackService.intent(ctx, PlaybackService.ACTION_SHUFFLE, 5))
                .addAction(android.R.drawable.ic_media_previous, "Previous", PlaybackService.intent(ctx, PlaybackService.ACTION_PREV, 1))
                .addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playing ? "Pause" : "Play",
                        PlaybackService.intent(ctx, PlaybackService.ACTION_TOGGLE, 2))
                .addAction(android.R.drawable.ic_media_next, "Next", PlaybackService.intent(ctx, PlaybackService.ACTION_NEXT, 3))
                .addAction(repeat ? R.drawable.ic_repeat_one_on : R.drawable.ic_repeat_off, repeat ? "Repeat on" : "Repeat off",
                        PlaybackService.intent(ctx, PlaybackService.ACTION_REPEAT, 6))
                .setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                        .setMediaSession(session.getSessionToken())
                        .setShowActionsInCompactView(1, 2, 3));
        return b.build();
    }

    private void loadArtwork(String url) {
        if (!url.startsWith("https://")) return;
        artLoader.execute(() -> {
            Bitmap bitmap = download(url);
            if (bitmap == null || !url.equals(artworkUrl)) return;
            artwork = bitmap;
            session.setMetadata(metadata());
            refreshNotification();
        });
    }

    private static Bitmap download(String url) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            byte[] bytes;
            try (InputStream in = conn.getInputStream()) { bytes = readAll(in); }
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = 1;
            while (Math.max(bounds.outWidth, bounds.outHeight) / (opts.inSampleSize * 2) >= ART_SIZE) opts.inSampleSize *= 2;
            opts.inPreferredConfig = Bitmap.Config.RGB_565;
            Bitmap decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opts);
            if (decoded == null) return null;
            // the cover is handed to the system twice (session + notification); a big one is over the
            // 1 MB limit of such a call, so keep it small
            float k = Math.min(1f, ART_SIZE / (float) Math.max(decoded.getWidth(), decoded.getHeight()));
            if (k >= 1f) return decoded;
            Bitmap scaled = Bitmap.createScaledBitmap(decoded, Math.round(decoded.getWidth() * k), Math.round(decoded.getHeight() * k), true);
            if (scaled != decoded) decoded.recycle();
            return scaled;
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static byte[] readAll(InputStream in) throws java.io.IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) {
            out.write(buf, 0, n);
            if (out.size() > 8 * 1024 * 1024) break;
        }
        return out.toByteArray();
    }

    void shutdown() {
        playing = false;
        releaseLocks();
        Context ctx = getContext();
        if (session != null) session.setActive(false);
        try { ctx.stopService(new Intent(ctx, PlaybackService.class)); } catch (Exception ignored) {}
        try { ctx.getSystemService(NotificationManager.class).cancel(NOTIFICATION_ID); } catch (Exception ignored) {}
    }

    @Override
    protected void handleOnDestroy() {
        shutdown();
        if (session != null) session.release();
        artLoader.shutdownNow();
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }
}
