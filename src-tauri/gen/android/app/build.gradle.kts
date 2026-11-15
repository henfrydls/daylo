import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 36
    namespace = "com.daylo.app"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.daylo.app"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }

    // The Google Play bundle, and only it, merges src/play/AndroidManifest.xml over the
    // rest: it takes SCHEDULE_EXACT_ALARM out and marks the build as the Play one. It also
    // gets the application id in gradle.properties, dayloPlayApplicationId, because Play
    // already has a com.daylo.app from somebody else. namespace stays, so the Kotlin classes,
    // R and the JNI names do not move; whatever is named after the id (the FileProvider
    // authority) is written as ${applicationId} and follows it. release.yml
    // sets the property for the pass that builds the AAB and not for the one that builds the
    // APK. The release build type is used because its manifest is merged over main and over
    // every library, so the removal wins whoever declared the permission, and because a
    // product flavor would rename the variants the Tauri CLI calls by name.
    if (providers.gradleProperty("dayloPlay").orNull == "true") {
        sourceSets.getByName("release").manifest.srcFile("src/play/AndroidManifest.xml")
        defaultConfig.applicationId = providers.gradleProperty("dayloPlayApplicationId").orNull
            ?: error("dayloPlay is true and gradle.properties has no dayloPlayApplicationId")
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")