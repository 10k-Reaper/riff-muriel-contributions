package io.github.cloverscripts.muriel;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.ServiceCompat;

/**
 * Keeps Muriel in the foreground while a song plays (Android stops background apps to save memory,
 * which cut the music off) and receives the buttons of the playback notification on Android 12 and
 * older; newer versions call the media session directly. MediaControlsPlugin owns everything else.
 */
public class PlaybackService extends Service {
    static final String ACTION_REFRESH = "io.github.cloverscripts.muriel.REFRESH";
    static final String ACTION_TOGGLE = "io.github.cloverscripts.muriel.TOGGLE";
    static final String ACTION_NEXT = "io.github.cloverscripts.muriel.NEXT";
    static final String ACTION_PREV = "io.github.cloverscripts.muriel.PREV";
    static final String ACTION_DISMISS = "io.github.cloverscripts.muriel.DISMISS";

    static volatile boolean running;

    static PendingIntent intent(Context ctx, String action, int requestCode) {
        Intent i = new Intent(ctx, PlaybackService.class).setAction(action);
        return PendingIntent.getService(ctx, requestCode, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        running = true;
        String action = intent != null ? intent.getAction() : null;
        MediaControlsPlugin plugin = MediaControlsPlugin.instance;
        if (ACTION_TOGGLE.equals(action) && plugin != null) plugin.send(MediaControlsPlugin.playing ? "pause" : "play", -1);
        else if (ACTION_NEXT.equals(action) && plugin != null) plugin.send("next", -1);
        else if (ACTION_PREV.equals(action) && plugin != null) plugin.send("prev", -1);
        else if (ACTION_DISMISS.equals(action)) { stopSelf(); return START_NOT_STICKY; }
        show();
        return START_NOT_STICKY;
    }

    // foreground while playing; paused, the notification stays but can be swiped away
    private void show() {
        Notification n = MediaControlsPlugin.notification;
        if (n == null) { stopSelf(); return; }
        try {
            if (MediaControlsPlugin.playing) {
                int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0;
                ServiceCompat.startForeground(this, MediaControlsPlugin.NOTIFICATION_ID, n, type);
            } else {
                ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH);
                getSystemService(NotificationManager.class).notify(MediaControlsPlugin.NOTIFICATION_ID, n);
            }
        } catch (Exception e) {
            // not allowed to go foreground right now (Android 12+ from the background): just show it
            try { getSystemService(NotificationManager.class).notify(MediaControlsPlugin.NOTIFICATION_ID, n); } catch (Exception ignored) {}
        }
    }

    // the app was swiped away: the music stopped with it, so the controls go too
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        MediaControlsPlugin plugin = MediaControlsPlugin.instance;
        if (plugin != null) plugin.shutdown();
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        running = false;
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
