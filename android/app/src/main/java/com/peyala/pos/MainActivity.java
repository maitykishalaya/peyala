package com.peyala.pos;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JsResult;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends AppCompatActivity {

    private static final String PREFS_NAME = "peyala_pos_prefs";
    private static final String KEY_SERVER_URL = "server_url";
    private static final String DEFAULT_SERVER_URL = "http://192.168.29.241:3000";
    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;

    private WebView webView;
    private SwipeRefreshLayout swipeRefreshLayout;
    private ProgressBar progressBar;
    private LinearLayout layoutError;
    private EditText etServerUrl;
    private Button btnRetry;
    private TextView txtStatus;
    private ImageButton btnSettings;
    private ImageView imgLogo;

    private SharedPreferences prefs;
    private String currentServerUrl;
    private boolean doubleBackToExitPressedOnce = false;
    private ValueCallback<Uri[]> fileUploadCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // Keep screen on during restaurant service / floor order taking
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        currentServerUrl = prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL);

        initViews();
        setupWebView();
        setupListeners();

        loadUrl(currentServerUrl);
    }

    private void initViews() {
        webView = findViewById(R.id.webView);
        swipeRefreshLayout = findViewById(R.id.swipeRefreshLayout);
        progressBar = findViewById(R.id.progressBar);
        layoutError = findViewById(R.id.layoutError);
        etServerUrl = findViewById(R.id.etServerUrl);
        btnRetry = findViewById(R.id.btnRetry);
        txtStatus = findViewById(R.id.txtStatus);
        btnSettings = findViewById(R.id.btnSettings);
        imgLogo = findViewById(R.id.imgLogo);

        etServerUrl.setText(currentServerUrl);
        swipeRefreshLayout.setColorSchemeResources(R.color.accent, R.color.primary_dark);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false); // Audio chime for KDS alerts
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Mobile POS User-Agent
        String defaultUa = settings.getUserAgentString();
        settings.setUserAgentString(defaultUa + " PeyalaPOS-Android/1.0");

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("tel:") || url.startsWith("mailto:") || url.startsWith("whatsapp:")) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        startActivity(intent);
                        return true;
                    } catch (Exception e) {
                        return false;
                    }
                }
                return false;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                progressBar.setVisibility(View.VISIBLE);
                txtStatus.setText("");
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                swipeRefreshLayout.setRefreshing(false);

                // If loaded successfully, hide error panel and show webview
                if (layoutError.getVisibility() == View.VISIBLE) {
                    layoutError.setVisibility(View.GONE);
                    webView.setVisibility(View.VISIBLE);
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    progressBar.setVisibility(View.GONE);
                    swipeRefreshLayout.setRefreshing(false);
                    showConnectionError("Connection Failed: " + error.getDescription());
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                if (newProgress >= 100) {
                    progressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("Peyala POS")
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, (dialog, which) -> result.confirm())
                        .setCancelable(false)
                        .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("Peyala POS")
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, (dialog, which) -> result.confirm())
                        .setNegativeButton(android.R.string.cancel, (dialog, which) -> result.cancel())
                        .setCancelable(false)
                        .show();
                return true;
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (fileUploadCallback != null) {
                    fileUploadCallback.onReceiveValue(null);
                }
                fileUploadCallback = filePathCallback;

                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE);
                } catch (Exception e) {
                    fileUploadCallback = null;
                    return false;
                }
                return true;
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                return super.onConsoleMessage(consoleMessage);
            }
        });

        // Download handling for bills / CSV exports
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
                try {
                    DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                    request.setMimeType(mimetype);
                    request.allowScanningByMediaScanner();
                    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    String filename = URLUtil.guessFileName(url, contentDisposition, mimetype);
                    request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);

                    DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    if (dm != null) {
                        dm.enqueue(request);
                        Toast.makeText(MainActivity.this, "Downloading " + filename + "...", Toast.LENGTH_SHORT).show();
                    }
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Download failed: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                }
            }
        });
    }

    private void setupListeners() {
        swipeRefreshLayout.setOnRefreshListener(() -> {
            if (layoutError.getVisibility() == View.VISIBLE) {
                retryConnection();
            } else {
                webView.reload();
            }
        });

        btnRetry.setOnClickListener(v -> retryConnection());

        // Long press on Logo opens Server Settings dialog
        imgLogo.setOnLongClickListener(v -> {
            showServerSettingsDialog();
            return true;
        });

        btnSettings.setOnClickListener(v -> showServerSettingsDialog());
    }

    private void showConnectionError(String errorDetail) {
        webView.setVisibility(View.GONE);
        layoutError.setVisibility(View.VISIBLE);
        txtStatus.setText(errorDetail);
        etServerUrl.setText(currentServerUrl);
    }

    private void retryConnection() {
        String inputUrl = etServerUrl.getText().toString().trim();
        if (inputUrl.isEmpty()) {
            inputUrl = DEFAULT_SERVER_URL;
        }
        if (!inputUrl.startsWith("http://") && !inputUrl.startsWith("https://")) {
            inputUrl = "http://" + inputUrl;
        }

        currentServerUrl = inputUrl;
        prefs.edit().putString(KEY_SERVER_URL, currentServerUrl).apply();

        txtStatus.setText("Testing connection to " + currentServerUrl + "...");
        btnRetry.setEnabled(false);

        final String testUrl = currentServerUrl;
        new Thread(() -> {
            boolean reachable = isServerReachable(testUrl);
            new Handler(Looper.getMainLooper()).post(() -> {
                btnRetry.setEnabled(true);
                if (reachable) {
                    layoutError.setVisibility(View.GONE);
                    webView.setVisibility(View.VISIBLE);
                    loadUrl(testUrl);
                } else {
                    txtStatus.setText("❌ Server unreachable. Make sure the computer is on and Wi-Fi matches.");
                    Toast.makeText(MainActivity.this, "Cannot connect to " + testUrl, Toast.LENGTH_SHORT).show();
                }
            });
        }).start();
    }

    private boolean isServerReachable(String serverUrl) {
        try {
            URL url = new URL(serverUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(3000);
            conn.setReadTimeout(3000);
            conn.setRequestMethod("GET");
            int responseCode = conn.getResponseCode();
            conn.disconnect();
            return (responseCode >= 200 && responseCode < 400);
        } catch (IOException e) {
            return false;
        }
    }

    private void showServerSettingsDialog() {
        final EditText input = new EditText(this);
        input.setText(currentServerUrl);
        input.setSelection(input.getText().length());
        input.setPadding(40, 30, 40, 30);

        new AlertDialog.Builder(this)
                .setTitle("Peyala Server Address")
                .setMessage("Enter the IP address of the counter computer running Peyala POS:")
                .setView(input)
                .setPositiveButton("Save & Reload", (dialog, which) -> {
                    String newUrl = input.getText().toString().trim();
                    if (!newUrl.isEmpty()) {
                        if (!newUrl.startsWith("http://") && !newUrl.startsWith("https://")) {
                            newUrl = "http://" + newUrl;
                        }
                        currentServerUrl = newUrl;
                        prefs.edit().putString(KEY_SERVER_URL, currentServerUrl).apply();
                        etServerUrl.setText(currentServerUrl);
                        loadUrl(currentServerUrl);
                    }
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void loadUrl(String url) {
        webView.loadUrl(url);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            if (fileUploadCallback != null) {
                Uri[] results = null;
                if (resultCode == RESULT_OK && data != null) {
                    if (data.getData() != null) {
                        results = new Uri[]{data.getData()};
                    } else if (data.getClipData() != null) {
                        int count = data.getClipData().getItemCount();
                        results = new Uri[count];
                        for (int i = 0; i < count; i++) {
                            results[i] = data.getClipData().getItemAt(i).getUri();
                        }
                    }
                }
                fileUploadCallback.onReceiveValue(results);
                fileUploadCallback = null;
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (layoutError.getVisibility() == View.VISIBLE) {
            super.onBackPressed();
            return;
        }

        if (webView.canGoBack()) {
            webView.goBack();
            return;
        }

        if (doubleBackToExitPressedOnce) {
            super.onBackPressed();
            return;
        }

        this.doubleBackToExitPressedOnce = true;
        Toast.makeText(this, R.string.press_again_to_exit, Toast.LENGTH_SHORT).show();

        new Handler(Looper.getMainLooper()).postDelayed(() -> doubleBackToExitPressedOnce = false, 2000);
    }
}
