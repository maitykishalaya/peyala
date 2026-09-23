# Proguard rules for Peyala POS Android App

# Keep JavaScript Interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep WebChromeClient and WebViewClient
-keepclassmembers class * extends android.webkit.WebChromeClient {
    public *;
}
-keepclassmembers class * extends android.webkit.WebViewClient {
    public *;
}

# Don't obfuscate model or activity classes
-keep class com.peyala.pos.** { *; }
