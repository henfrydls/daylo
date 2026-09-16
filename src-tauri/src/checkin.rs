//! The anonymous check-in: the whole of what Daylo ever sends anywhere.
//!
//! It is here and not in the webview for the reason that is also the point. The app's CSP
//! is `default-src 'none'` with `connect-src 'self' ipc: tauri:`, so the page can reach no
//! host at all, and anyone can check that in tauri.conf.json without trusting us. Nothing
//! checks the native side for them, so this file is short enough to read instead: four
//! fields, one address, no retry, no queue, no state.

/// Both are named in the privacy policy, and scripts/check-no-analytics.sh checks that this
/// is the only file under src-tauri/ naming a host, with exactly one URL, equal to this one.
const URL: &str = "https://checkin.henfrydls.com/api/send";
const WEBSITE: &str = "b382ce66-26f7-4bc7-9a0a-34d4c5e730f2";

#[derive(serde::Serialize)]
pub struct CheckinFields {
    version: String,
    os: &'static str,
}

/// The switch that turns the check-in off for a whole build, read from the environment.
///
/// It exists because continuous integration starts the app to see whether it starts, and
/// since 1.3 a fresh profile is a new installation, which means every such run was a real
/// device as far as the server could tell: a new random number, one check-in, never seen
/// again. Seven of them arrived in one evening before anybody noticed. They are not
/// people, and a number that counts them is worth less than one that does not.
///
/// Set to anything at all, including empty, it makes the app behave as it does on the web:
/// no menu entry, no line, nothing sent. Anybody building Daylo themselves can use it for
/// the same reason.
fn disabled() -> bool {
    std::env::var_os("DAYLO_DISABLE_CHECKIN").is_some()
}

/// What the message carries for this build, and the one gate in front of it.
///
/// Both commands go through here, so the switch cannot be honoured by the one that draws
/// the screen and forgotten by the one that opens a socket: there is nothing to forget,
/// because there is only one of it.
fn fields<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<CheckinFields, String> {
    if disabled() {
        return Err("the check-in is off: DAYLO_DISABLE_CHECKIN is set".into());
    }

    Ok(CheckinFields {
        version: app.package_info().version.to_string(),
        os: std::env::consts::OS,
    })
}

/// What the message carries for this build, so the settings sheet can show exactly what
/// leaves. Desktop and Android only: a rejected call means "no check-in here", which is
/// also what the environment switch produces.
/// Generic over the runtime so the tests can call it with Tauri's mock one. That is the
/// only reason: there is one runtime in the app.
#[tauri::command]
pub fn checkin_fields<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<CheckinFields, String> {
    fields(&app)
}

/// The message, and nothing but the message. `last` is added only when the switch is being
/// turned off. Separate from the sending so that "exactly these four keys" is something a
/// test asserts rather than something a comment claims.
pub fn message(id: &str, version: &str, os: &str, date: &str, last: bool) -> serde_json::Value {
    let mut data = serde_json::json!({ "id": id, "version": version, "os": os, "date": date });
    if last {
        data["last"] = serde_json::Value::Bool(true);
    }
    serde_json::json!({
        "type": "event",
        "payload": {
            "website": WEBSITE,
            "hostname": "app",
            "url": "/",
            "name": "check-in",
            "data": data
        }
    })
}

/// Send one check-in. A failure is reported to the caller and forgotten: no queue, no
/// retry, no backoff; whether there is another is tomorrow's question, and the webview's.
/// The user agent is the bare word Daylo, because the version already travels as a field
/// and one carrying more would make "nothing else" harder to check than to say.
#[tauri::command]
pub async fn send_checkin<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    id: String,
    date: String,
    last: bool,
) -> Result<(), String> {
    // Through the same gate as the screen, and before anything opens a socket: a webview
    // that was already open, or a caller that skips the screen entirely, gets the same
    // refusal. It also happens to be where the version comes from.
    let CheckinFields { version, os } = fields(&app)?;
    let body = message(&id, &version, os, &date, last);
    tauri::async_runtime::spawn_blocking(move || post(body))
        .await
        .map_err(|error| error.to_string())?
}

/// The only thing in this file that opens a socket, and the only place the address is
/// written. The user agent is the bare word Daylo, because the version already travels as
/// a field and one carrying more would make "nothing else" harder to check than to say.
#[cfg(not(test))]
fn post(body: serde_json::Value) -> Result<(), String> {
    ureq::post(URL)
        .set("User-Agent", "Daylo")
        .timeout(std::time::Duration::from_secs(10))
        .send_json(body)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

/// In the test binary there is no network at all, and the substitution is not a nicety.
/// The test below calls the real command with the switch on, which is the only way to
/// prove the gate is where it should be; the first time somebody breaks that gate, the
/// test would otherwise write rows into the live server. It did: four of them, from a
/// mutation run, carrying the mock app's version and the example number.
///
/// Remembering the call rather than only refusing it is what keeps the test honest. A
/// stub that merely returned an error would let a broken gate pass, because the assertion
/// would still be looking at a failure.
#[cfg(test)]
static REACHED_THE_NETWORK: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

#[cfg(test)]
fn post(_body: serde_json::Value) -> Result<(), String> {
    REACHED_THE_NETWORK.store(true, std::sync::atomic::Ordering::SeqCst);
    Err("the tests do not reach the network".into())
}

#[cfg(test)]
mod tests {
    use super::{message, WEBSITE};

    /// The promise the privacy policy makes, as an assertion. Four keys, and a fifth only
    /// when the switch is being turned off — which the dialog announces before anyone can
    /// turn anything on.
    #[test]
    fn carries_four_things_and_a_fifth_only_at_the_end() {
        let ordinary = message(
            "4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e",
            "1.3.0",
            "android",
            "2026-09-14",
            false,
        );
        let data = ordinary["payload"]["data"].as_object().unwrap();

        let mut keys: Vec<&str> = data.keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(keys, ["date", "id", "os", "version"]);

        let farewell = message(
            "4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e",
            "1.3.0",
            "android",
            "2026-09-14",
            true,
        );
        let data = farewell["payload"]["data"].as_object().unwrap();
        let mut keys: Vec<&str> = data.keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(keys, ["date", "id", "last", "os", "version"]);
        assert_eq!(farewell["payload"]["data"]["last"], serde_json::json!(true));
    }

    /// The switch, from the two ends that matter: the helper reads it, and both commands
    /// go through the helper. One test and not two, because the variable is process wide
    /// and Rust runs tests in threads: two tests setting and clearing it race, and the
    /// one that lost said the check-in was available with the switch on, which is the
    /// exact lie this is here to prevent.
    ///
    /// `send_checkin` is called on purpose while it is off: if the gate were missing, the
    /// test would try to reach the network, which fails the test either way.
    #[test]
    fn the_environment_turns_the_whole_thing_off() {
        // SAFETY: the variable is set and removed inside this one test, and nothing else
        // in this file reads it.
        unsafe { std::env::set_var("DAYLO_DISABLE_CHECKIN", "") };
        let empty_counts = super::disabled();

        unsafe { std::env::set_var("DAYLO_DISABLE_CHECKIN", "1") };
        let app = tauri::test::mock_app();
        let fields = super::checkin_fields(app.handle().clone());
        let sent = tauri::async_runtime::block_on(super::send_checkin(
            app.handle().clone(),
            "4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e".into(),
            "2026-09-16".into(),
            false,
        ));

        unsafe { std::env::remove_var("DAYLO_DISABLE_CHECKIN") };
        let unset_is_the_ordinary_case = !super::disabled();

        assert!(empty_counts, "an empty value still means off");
        assert!(
            fields.is_err(),
            "the screen must not be told there is a check-in here"
        );
        assert!(sent.is_err(), "nothing may leave the machine");
        assert!(
            !super::REACHED_THE_NETWORK.load(std::sync::atomic::Ordering::SeqCst),
            "the gate is not where it should be: the sender was reached"
        );
        assert!(
            unset_is_the_ordinary_case,
            "unset is the ordinary case: the check-in exists"
        );
    }

    /// Nothing about the person, the device or the habits rides along in the envelope
    /// either. The values outside `data` are constants and are pinned as such.
    #[test]
    fn the_envelope_says_nothing_about_anyone() {
        let m = message("id", "1.3.0", "linux", "2026-09-14", false);

        assert_eq!(m["type"], serde_json::json!("event"));
        assert_eq!(m["payload"]["hostname"], serde_json::json!("app"));
        assert_eq!(m["payload"]["url"], serde_json::json!("/"));
        assert_eq!(m["payload"]["name"], serde_json::json!("check-in"));
        assert_eq!(m["payload"]["website"], serde_json::json!(WEBSITE));
        // The whole message, so a field added anywhere in it fails here.
        let mut top: Vec<&str> = m["payload"]
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        top.sort_unstable();
        assert_eq!(top, ["data", "hostname", "name", "url", "website"]);
    }
}
