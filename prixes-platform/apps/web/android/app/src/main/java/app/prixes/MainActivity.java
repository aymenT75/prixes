package software.omnilink.prixes;

import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Android maps the system font scale straight onto the WebView's text zoom, so a
     * device set to 200% rendered the whole app at 200%. On a 384px-wide viewport that
     * pushed the hero heading over six lines and left every menu barely readable.
     *
     * Clamp it rather than ignore it: someone who asked for large text still gets
     * noticeably bigger type, and the in-app accessibility panel can take it further on
     * demand. Honouring the setting literally and shipping an unusable layout is the
     * worse of the two accessibility failures.
     */
    private static final int MAX_TEXT_ZOOM = 115;

    @Override
    public void onStart() {
        super.onStart();
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebSettings settings = getBridge().getWebView().getSettings();
        if (settings.getTextZoom() > MAX_TEXT_ZOOM) {
            settings.setTextZoom(MAX_TEXT_ZOOM);
        }
    }
}
