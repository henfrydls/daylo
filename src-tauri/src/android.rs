//! Asking the phone things only the phone knows.
//!
//! Everything in here runs on Android and nowhere else, which is why none of it can be
//! run by `cargo test` on a laptop. What can be tested is kept out: the words this module
//! produces are mapped by plain functions in `packaging.rs`, and those are pinned by
//! tests that run anywhere. What is left here is the asking itself.
//!
//! The way in is `ndk_context`, which tao fills in while the activity is created, so by
//! the time any command runs there is a JavaVM and an Activity to borrow. Going through
//! the webview's JNI handle would also work and is what Tauri's own examples show, but it
//! hops to the UI thread and answers through a callback, and nothing here needs either.

use jni::objects::{JObject, JObjectArray, JString, JValue};
use jni::{JNIEnv, JavaVM};
use std::sync::OnceLock;

/// Borrow a JNI environment and the app's own Activity for the length of one question.
///
/// Returns None rather than an error for every way this can fail, because every one of
/// them means the same thing to the caller: the phone did not answer. A caller that
/// cannot tell "no" from "could not ask" would have to guess, and this module exists so
/// that the guessing happens in one place with a comment on it.
fn context_is_there() -> bool {
    let context = ndk_context::android_context();
    !context.vm().is_null() && !context.context().is_null()
}

fn with_the_activity<T>(
    ask: impl FnOnce(&mut jni::JNIEnv, &JObject) -> jni::errors::Result<T>,
) -> Option<T> {
    let context = ndk_context::android_context();
    if !context_is_there() {
        return None;
    }

    // SAFETY: both pointers come from ndk_context, which tao filled in with the VM and the
    // Activity it was handed when the app started. Neither is owned here: the JavaVM is
    // borrowed for the length of this function and the Activity is a reference the VM
    // keeps alive for as long as the process has one.
    let vm = unsafe { JavaVM::from_raw(context.vm().cast()) }.ok()?;
    let mut env = vm.attach_current_thread().ok()?;
    // SAFETY: as above. The lifetime is the call below and nothing escapes it.
    let activity = unsafe { JObject::from_raw(context.context().cast()) };

    // Every local reference the question makes lives in a frame of its own and goes when
    // the frame does. A thread that was already attached, which the main thread is, does
    // not free them when a command returns, and some of these questions run on every
    // return to the front: without the frame they piled up until Android aborted the app
    // with "local reference table overflow". The capacity is a starting size, not a limit.
    let answer = env.with_local_frame(LOCAL_FRAME, |env| ask(env, &activity));

    // A Java exception left pending makes the next JNI call anywhere in the process
    // undefined, and the next JNI call is not ours: it is whatever the webview does on the
    // following frame. So it is cleared here whether or not the question succeeded, and
    // the question is treated as unanswered when one was raised.
    if env.exception_check().unwrap_or(false) {
        let _ = env.exception_clear();
        return None;
    }
    answer.ok()
}

/// How many local references a question is expected to need, for the frame it runs in.
const LOCAL_FRAME: i32 = 32;

/// Android's API level, which decides which of the questions below can be asked.
fn sdk_int(env: &mut jni::JNIEnv) -> jni::errors::Result<i32> {
    let version = env.find_class("android/os/Build$VERSION")?;
    env.get_static_field(version, "SDK_INT", "I")?.i()
}

/// Android's API level, asked on its own. The reminder screen needs it because below
/// Android 12 every build arms exact alarms, permission or not.
pub fn sdk_level() -> Option<i32> {
    with_the_activity(|env, _activity| sdk_int(env))
}

/// The app's PackageManager, which every question about the installed package starts from.
fn package_manager<'local>(
    env: &mut JNIEnv<'local>,
    activity: &JObject,
) -> jni::errors::Result<JObject<'local>> {
    env.call_method(
        activity,
        "getPackageManager",
        "()Landroid/content/pm/PackageManager;",
        &[],
    )?
    .l()
}

/// The app's own package name, as a Java string, for the questions that name it.
fn package_name<'local>(
    env: &mut JNIEnv<'local>,
    activity: &JObject,
) -> jni::errors::Result<JObject<'local>> {
    env.call_method(activity, "getPackageName", "()Ljava/lang/String;", &[])?
        .l()
}

/// The package that installed this copy, as the phone recorded it, or None.
///
/// None covers three different things and they are all the same answer: nothing installed
/// it through a package of its own (`adb install` leaves no name), the phone refused to
/// say, or the question could not be asked at all.
///
/// `getInstallSourceInfo` arrived in API 30 and `getInstallerPackageName` is what there is
/// below that. The app's minSdk is 24, so both are needed: the older one is deprecated,
/// not gone, and on the phones that have only it, it is the answer.
pub fn installer_package_name() -> Option<String> {
    with_the_activity(|env, activity| {
        let manager = package_manager(env, activity)?;
        let package = package_name(env, activity)?;

        let installer = if sdk_int(env)? >= 30 {
            let info = env
                .call_method(
                    &manager,
                    "getInstallSourceInfo",
                    "(Ljava/lang/String;)Landroid/content/pm/InstallSourceInfo;",
                    &[JValue::Object(&package)],
                )?
                .l()?;
            env.call_method(
                &info,
                "getInstallingPackageName",
                "()Ljava/lang/String;",
                &[],
            )?
            .l()?
        } else {
            env.call_method(
                &manager,
                "getInstallerPackageName",
                "(Ljava/lang/String;)Ljava/lang/String;",
                &[JValue::Object(&package)],
            )?
            .l()?
        };

        if installer.is_null() {
            return Ok(None);
        }
        Ok(Some(String::from(
            env.get_string(&JString::from(installer))?,
        )))
    })
    .flatten()
}

/// How long to wait for the other end, in milliseconds, for each of connecting and
/// reading. Short on purpose: nothing waits on this answer and nobody asked for it, so a
/// slow network should end in "could not find out" rather than in a request still open
/// when the person has moved on.
const PATIENCE: i32 = 5_000;

/// Fetch a small text document with the phone's own HTTP client.
///
/// Java's and not a Rust one, which keeps a second TLS stack out of the APK and leaves
/// the connection to the platform that is already trusted to make them. No headers are
/// set and no body is sent: what goes out is what any request carries.
///
/// The caller must not be on the interface thread. Android throws
/// NetworkOnMainThreadException there, and a Tauri command is on the main thread unless it
/// is async, so the command that calls this hands it to a blocking thread.
///
/// Every failure is an Err and none of them is an empty string, because "nothing came
/// back" and "nothing is there" are different answers and only one of them is news.
pub fn fetch_text(url: &str, limit: i32) -> Result<String, String> {
    with_the_activity(|env, _activity| {
        let address = env.new_string(url)?;
        let target = env.new_object(
            "java/net/URL",
            "(Ljava/lang/String;)V",
            &[JValue::Object(&address)],
        )?;
        let connection = env
            .call_method(&target, "openConnection", "()Ljava/net/URLConnection;", &[])?
            .l()?;

        env.call_method(
            &connection,
            "setConnectTimeout",
            "(I)V",
            &[JValue::Int(PATIENCE)],
        )?;
        env.call_method(
            &connection,
            "setReadTimeout",
            "(I)V",
            &[JValue::Int(PATIENCE)],
        )?;

        // Resolved against the object's own class, so these reach HttpURLConnection even
        // though openConnection is typed as its parent.
        let status = env
            .call_method(&connection, "getResponseCode", "()I", &[])?
            .i()?;
        if status != 200 {
            return Ok(Err(format!("the address answered {status}")));
        }

        // -1 means the other end did not say, which is allowed; a number that is too big
        // is refused before anything is read rather than after.
        let length = env
            .call_method(&connection, "getContentLength", "()I", &[])?
            .i()?;
        if length > limit {
            return Ok(Err(format!(
                "the answer is {length} bytes, which is too much"
            )));
        }

        let stream = env
            .call_method(
                &connection,
                "getInputStream",
                "()Ljava/io/InputStream;",
                &[],
            )?
            .l()?;

        // Read into a buffer one byte longer than the limit, so that filling it is itself
        // the answer: anything that long has already gone past what will be read.
        //
        // The declared length above is an early refusal and nothing more. A server may
        // not declare one at all, which is what chunked encoding is, and then the number
        // is -1 and promises nothing. A limit that only holds when the other end
        // volunteers its size is not a limit, and this used to be one: the reading itself
        // had no bound.
        let room = limit + 1;
        let buffer = env.new_byte_array(room)?;
        let mut filled: i32 = 0;
        loop {
            let read = env
                .call_method(
                    &stream,
                    "read",
                    "([BII)I",
                    &[
                        JValue::Object(&buffer),
                        JValue::Int(filled),
                        JValue::Int(room - filled),
                    ],
                )?
                .i()?;
            if read < 0 {
                break;
            }
            filled += read;
            if filled > limit {
                return Ok(Err(format!("the answer is longer than {limit} bytes")));
            }
        }

        let encoding = env.new_string("UTF-8")?;
        let decoded = env.new_object(
            "java/lang/String",
            "([BIILjava/lang/String;)V",
            &[
                JValue::Object(&buffer),
                JValue::Int(0),
                JValue::Int(filled),
                JValue::Object(&encoding),
            ],
        )?;
        let text = String::from(env.get_string(&JString::from(decoded))?);

        env.call_method(&connection, "disconnect", "()V", &[])?;
        Ok(Ok(text))
    })
    .unwrap_or_else(|| {
        // Two different failures arrive here as the same None: a Java exception that the
        // helper cleared, which is what a timeout, an unknown host or a broken connection
        // look like from this side, and a context that was not there to ask at all. The
        // second cannot really happen after the app has started, so saying which is worth
        // the one call it costs: a message that describes the wrong failure sends whoever
        // reads it looking in the wrong place.
        if context_is_there() {
            Err("the address did not answer".into())
        } else {
            Err("the phone could not be asked".into())
        }
    })
}

/// `PackageManager.GET_PERMISSIONS`, which fills in `requestedPermissions`.
const GET_PERMISSIONS: i32 = 0x0000_1000;

/// `PackageManager.GET_META_DATA`, which fills in `ApplicationInfo.metaData`.
const GET_META_DATA: i32 = 0x0000_0080;

/// The permission the APK asks for and the Google Play build does not.
const SCHEDULE_EXACT_ALARM: &str = "android.permission.SCHEDULE_EXACT_ALARM";

/// Whether the build that is installed asks Android for SCHEDULE_EXACT_ALARM, or None if
/// the package could not be read.
///
/// Read from the installed package and not written into the app, because one tree makes
/// two builds: the APK asks for it, and the Google Play bundle has it taken out by a
/// manifest overlay (src-tauri/gen/android/app/src/play/AndroidManifest.xml). This is the
/// merged manifest the phone actually holds, including anything a library added.
///
/// Not `canScheduleExactAlarms`, which says no both for a build that never asked and for one
/// that asked and was refused, and those two get different words on the screen.
///
/// `getPackageInfo(String, int)` is deprecated from API 33, where the flags became a
/// `PackageInfoFlags`; both are needed because the app's minSdk is 24.
pub fn requests_exact_alarms() -> Option<bool> {
    // What a package asks for cannot change while its process lives: a new manifest is an
    // update, and an update restarts the process. So it is read once. Only an answer is
    // kept; a failed read is tried again the next time.
    static REQUESTED: OnceLock<bool> = OnceLock::new();
    if let Some(requested) = REQUESTED.get() {
        return Some(*requested);
    }
    let requested = read_requests_exact_alarms()?;
    let _ = REQUESTED.set(requested);
    Some(requested)
}

fn read_requests_exact_alarms() -> Option<bool> {
    with_the_activity(|env, activity| {
        let manager = package_manager(env, activity)?;
        let package = package_name(env, activity)?;

        let info = if sdk_int(env)? >= 33 {
            let flags = env
                .call_static_method(
                    "android/content/pm/PackageManager$PackageInfoFlags",
                    "of",
                    "(J)Landroid/content/pm/PackageManager$PackageInfoFlags;",
                    &[JValue::Long(GET_PERMISSIONS as i64)],
                )?
                .l()?;
            env.call_method(
                &manager,
                "getPackageInfo",
                "(Ljava/lang/String;Landroid/content/pm/PackageManager$PackageInfoFlags;)Landroid/content/pm/PackageInfo;",
                &[JValue::Object(&package), JValue::Object(&flags)],
            )?
            .l()?
        } else {
            env.call_method(
                &manager,
                "getPackageInfo",
                "(Ljava/lang/String;I)Landroid/content/pm/PackageInfo;",
                &[JValue::Object(&package), JValue::Int(GET_PERMISSIONS)],
            )?
            .l()?
        };

        // Null, not empty, when the package asks for no permissions at all.
        let requested = env
            .get_field(&info, "requestedPermissions", "[Ljava/lang/String;")?
            .l()?;
        if requested.is_null() {
            return Ok(false);
        }
        let requested = JObjectArray::from(requested);
        let count = env.get_array_length(&requested)?;
        // The frame around this question frees what it makes, and the references are still
        // deleted one by one here, because this is the one loop whose length the manifest
        // decides rather than this code.
        for index in 0..count {
            let name = env.get_object_array_element(&requested, index)?;
            if name.is_null() {
                continue;
            }
            let name = JString::from(name);
            let text = String::from(env.get_string(&name)?);
            env.delete_local_ref(name)?;
            if text == SCHEDULE_EXACT_ALARM {
                return Ok(true);
            }
        }
        Ok(false)
    })
}

/// Whether this phone will let Daylo set an alarm for an exact time.
///
/// Android 12 made exact alarms something an app has to be allowed, and Android 14 made
/// the answer "no" by default for an app like this one. There is a sister permission that
/// is granted on sight, `USE_EXACT_ALARM`, and Daylo deliberately does not ask for it:
/// Google reserves it for alarm clocks and calendars, and a habit tracker is neither.
///
/// Below Android 12 there is nothing to ask, so the answer is yes. True is also the answer
/// when the question cannot be put at all, and that direction is chosen on purpose: the
/// only thing this decides is whether the screen offers a way to fix something, and
/// offering a fix for a problem that may not exist is worse than staying quiet. The
/// reminder is scheduled either way.
///
/// Only meaningful for a build that asks for SCHEDULE_EXACT_ALARM, which the APK does and
/// the Google Play build does not: from Android 12 up, a build that never asked always
/// hears no. `requests_exact_alarms` is what tells the two apart, and the app reads both.
pub fn exact_alarms_allowed() -> bool {
    with_the_activity(|env, activity| {
        if sdk_int(env)? < 31 {
            return Ok(true);
        }
        let name = env.new_string("alarm")?;
        let alarms = env
            .call_method(
                activity,
                "getSystemService",
                "(Ljava/lang/String;)Ljava/lang/Object;",
                &[JValue::Object(&name)],
            )?
            .l()?;
        if alarms.is_null() {
            return Ok(true);
        }
        env.call_method(&alarms, "canScheduleExactAlarms", "()Z", &[])?
            .z()
    })
    .unwrap_or(true)
}

/// The channel the installed build was made for, as its manifest marks it, or None when it
/// carries no mark or the package could not be read.
///
/// Only the Google Play bundle has one: the overlay that takes SCHEDULE_EXACT_ALARM out
/// also adds `<meta-data android:name="daylo.channel" android:value="play" />`. It says what
/// the build is, which the installer cannot: a Play bundle put on a phone with bundletool,
/// adb or a transfer app has no Play installer recorded, and must still never offer an
/// update from outside Play. See `packaging::android_source`.
///
/// `getApplicationInfo(String, int)` is deprecated from API 33 like `getPackageInfo`, and
/// for the same reason both forms are here.
pub fn distribution_channel() -> Option<String> {
    with_the_activity(|env, activity| {
        let manager = package_manager(env, activity)?;
        let package = package_name(env, activity)?;

        let info = if sdk_int(env)? >= 33 {
            let flags = env
                .call_static_method(
                    "android/content/pm/PackageManager$ApplicationInfoFlags",
                    "of",
                    "(J)Landroid/content/pm/PackageManager$ApplicationInfoFlags;",
                    &[JValue::Long(GET_META_DATA as i64)],
                )?
                .l()?;
            env.call_method(
                &manager,
                "getApplicationInfo",
                "(Ljava/lang/String;Landroid/content/pm/PackageManager$ApplicationInfoFlags;)Landroid/content/pm/ApplicationInfo;",
                &[JValue::Object(&package), JValue::Object(&flags)],
            )?
            .l()?
        } else {
            env.call_method(
                &manager,
                "getApplicationInfo",
                "(Ljava/lang/String;I)Landroid/content/pm/ApplicationInfo;",
                &[JValue::Object(&package), JValue::Int(GET_META_DATA)],
            )?
            .l()?
        };

        // Null when the manifest has no meta-data at all, which is not the case today but
        // is a manifest Android accepts.
        let meta = env
            .get_field(&info, "metaData", "Landroid/os/Bundle;")?
            .l()?;
        if meta.is_null() {
            return Ok(None);
        }
        let key = env.new_string("daylo.channel")?;
        let value = env
            .call_method(
                &meta,
                "getString",
                "(Ljava/lang/String;)Ljava/lang/String;",
                &[JValue::Object(&key)],
            )?
            .l()?;
        if value.is_null() {
            return Ok(None);
        }
        Ok(Some(String::from(env.get_string(&JString::from(value))?)))
    })
    .flatten()
}

/// Open the system screen where exact alarms are allowed, and say whether it opened.
///
/// It is the phone's own screen, titled "Alarms & reminders", and nothing here grants
/// anything: the person does, or does not, and the app finds out the next time it asks.
/// The intent carries this app's package so the screen opens on Daylo's own entry rather
/// than on a list to go looking through.
pub fn ask_for_exact_alarms() -> bool {
    with_the_activity(|env, activity| {
        if sdk_int(env)? < 31 {
            return Ok(false);
        }
        let action = env.new_string("android.settings.REQUEST_SCHEDULE_EXACT_ALARM")?;
        let intent = env.new_object(
            "android/content/Intent",
            "(Ljava/lang/String;)V",
            &[JValue::Object(&action)],
        )?;

        let package = package_name(env, activity)?;
        let package = String::from(env.get_string(&JString::from(package))?);
        let target = env.new_string(format!("package:{package}"))?;
        let uri = env
            .call_static_method(
                "android/net/Uri",
                "parse",
                "(Ljava/lang/String;)Landroid/net/Uri;",
                &[JValue::Object(&target)],
            )?
            .l()?;
        env.call_method(
            &intent,
            "setData",
            "(Landroid/net/Uri;)Landroid/content/Intent;",
            &[JValue::Object(&uri)],
        )?;

        env.call_method(
            activity,
            "startActivity",
            "(Landroid/content/Intent;)V",
            &[JValue::Object(&intent)],
        )?;
        Ok(true)
    })
    .unwrap_or(false)
}

/// `Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY`: Android set this activity going again from
/// the recent apps, with the intent it was first started with.
const FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY: i32 = 0x0010_0000;

/// The extra the notification plugin puts on the intent a notification opens the app with,
/// holding that notification's id (`NOTIFICATION_INTENT_KEY` in its TauriNotificationManager.kt).
const NOTIFICATION_ID_EXTRA: &str = "NotificationId";

/// The id of the notification whose tap started this activity, or None when it was started
/// some other way or the intent could not be read.
///
/// For a tap that starts the app from nothing. The plugin turns the tap into an event, but it
/// does it while it loads, before the page has had a chance to listen, and Tauri drops a
/// plugin event nobody is listening for. A tap on a notification of an app that is still in
/// memory arrives later, through onNewIntent, as that event; this is for the other one.
///
/// Not when Android started the activity from the recent apps. It hands back the intent the
/// activity was first started with, so somebody who opened Daylo from the reminder, left,
/// and came back the next day from the recent apps after Android had ended the process would
/// be taken to the day sheet again, by a tap made the day before.
///
/// The extra is read and not removed. Asking twice is for the caller to prevent (see
/// `launch_notification` in lib.rs), because removing it here would change what the plugin
/// itself reads from the same intent.
pub fn launch_notification_id() -> Option<i32> {
    with_the_activity(|env, activity| {
        let intent = env
            .call_method(activity, "getIntent", "()Landroid/content/Intent;", &[])?
            .l()?;
        if intent.is_null() {
            return Ok(None);
        }
        let flags = env.call_method(&intent, "getFlags", "()I", &[])?.i()?;
        if flags & FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0 {
            return Ok(None);
        }
        let key = env.new_string(NOTIFICATION_ID_EXTRA)?;
        let id = env
            .call_method(
                &intent,
                "getIntExtra",
                "(Ljava/lang/String;I)I",
                &[JValue::Object(&key), JValue::Int(i32::MIN)],
            )?
            .i()?;
        // The same "none" the plugin uses for the same extra.
        if id == i32::MIN {
            return Ok(None);
        }
        Ok(Some(id))
    })
    .flatten()
}

/// Open the phone's notification settings for this app, and say whether they opened.
///
/// From Android 8 that is the app's own notification screen, with the switch that the
/// permission is. Below that there is no such screen, and the app's page in the system
/// settings is where notifications are turned on and off. Neither grants anything: the
/// person decides, and the app asks again when it comes back to the front.
pub fn open_notification_settings() -> bool {
    with_the_activity(|env, activity| {
        let package = package_name(env, activity)?;
        let intent = if sdk_int(env)? >= 26 {
            let action = env.new_string("android.settings.APP_NOTIFICATION_SETTINGS")?;
            let intent = env.new_object(
                "android/content/Intent",
                "(Ljava/lang/String;)V",
                &[JValue::Object(&action)],
            )?;
            let extra = env.new_string("android.provider.extra.APP_PACKAGE")?;
            env.call_method(
                &intent,
                "putExtra",
                "(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;",
                &[JValue::Object(&extra), JValue::Object(&package)],
            )?;
            intent
        } else {
            let action = env.new_string("android.settings.APPLICATION_DETAILS_SETTINGS")?;
            let intent = env.new_object(
                "android/content/Intent",
                "(Ljava/lang/String;)V",
                &[JValue::Object(&action)],
            )?;
            let name = String::from(env.get_string(&JString::from(package))?);
            let target = env.new_string(format!("package:{name}"))?;
            let uri = env
                .call_static_method(
                    "android/net/Uri",
                    "parse",
                    "(Ljava/lang/String;)Landroid/net/Uri;",
                    &[JValue::Object(&target)],
                )?
                .l()?;
            env.call_method(
                &intent,
                "setData",
                "(Landroid/net/Uri;)Landroid/content/Intent;",
                &[JValue::Object(&uri)],
            )?;
            intent
        };
        env.call_method(
            activity,
            "startActivity",
            "(Landroid/content/Intent;)V",
            &[JValue::Object(&intent)],
        )?;
        Ok(true)
    })
    .unwrap_or(false)
}
