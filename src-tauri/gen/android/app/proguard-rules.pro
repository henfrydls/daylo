# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Every Tauri plugin's model and argument classes are built by Jackson through reflection,
# in Invoke.parseArgs. R8 cannot see a reflective construction, so it strips the
# constructors it believes unused while leaving the class names in place, which is exactly
# what the failure reads like: "no Creators, like default constructor, exist" about a class
# it can still name.
#
# This cost a day on the Android reminder. The daily schedule could not be deserialised on
# any release build, and only on release, because isMinifyEnabled is false for debug: a
# debug APK would have "worked" and sent somebody chasing a difference that was not there.
#
# No plugin brings rules of its own. tauri-plugin-notification 2.3.3 declares
# consumerProguardFiles("consumer-rules.pro") and ships no such file; 2.4.0 ships it empty.
# So this has to live here, and it covers every plugin rather than the one that bit us,
# because the next one added would have the same hole and no reason to suspect it.
-keep class app.tauri.** { *; }
