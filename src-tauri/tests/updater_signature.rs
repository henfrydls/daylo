//! What stands between a person and somebody else's code: the signature.
//!
//! The updater downloads a file from the internet and runs it. The only thing that makes
//! that acceptable is that it refuses to run anything not signed by the key whose public
//! half is built into the app. That refusal is the whole ceremony around the private key,
//! and until this file existed nobody had ever seen it happen.
//!
//! So the test that matters here is not the happy one. It is the second: a manifest whose
//! signature has been altered by one character, which has to be rejected. It is written
//! the way it is because a check that only ever runs against correct input proves that the
//! code runs, not that it checks.
//!
//! No network and no installing. The server is local, and `download` is the last step
//! before anything is written anywhere: it fetches the bytes, verifies the signature
//! against the public key, and only then hands them back. `install` is what would touch
//! the machine, and it is deliberately not called: what it does depends on how the app was
//! packaged, and a binary built by a test is not packaged at all.

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};

const ARTIFACT: &[u8] = include_bytes!("fixtures/artifact.bin");
/// The signature of the bytes above, made once with a throwaway key whose private half was
/// destroyed the moment these fixtures were written. It signs nothing else and opens
/// nothing.
const SIGNATURE: &str = include_str!("fixtures/artifact.bin.sig");
/// A signature made with that same key over **a different file**. Well formed, correctly
/// encoded, verifiable: it simply does not belong to the artifact above. This is the shape
/// the danger actually has. A signature mangled at random is rejected while it is still
/// being decoded, which proves the decoder works and nothing about the checking.
const SIGNATURE_OF_SOMETHING_ELSE: &str = include_str!("fixtures/another-file.sig");
/// The public half of that same throwaway key. Not the one the app ships with, and never
/// to be confused with it: the app's lives in tauri.conf.json.
const PUBKEY: &str = include_str!("fixtures/test-only.pub");

/// Serves the two things an update needs and nothing else, on a port the system picks.
///
/// Hand-written rather than pulled in as a dependency, because a test whose job is to say
/// what this repository sends and accepts should not answer "it depends on a web server we
/// vendored". It answers every request until the test is over and the process ends.
fn bind() -> (TcpListener, String) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("no port to listen on");
    let port = listener.local_addr().unwrap().port();
    (listener, format!("http://127.0.0.1:{port}"))
}

/// Bound first and served afterwards on purpose: the manifest has to carry the address of
/// the very server that will hand out the artifact, and that address is not known until
/// the system has picked the port.
fn serve(listener: TcpListener, manifest: String) {
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(stream) = stream else { continue };
            answer(stream, &manifest);
        }
    });
}

fn answer(mut stream: TcpStream, manifest: &str) {
    let mut request = String::new();
    if BufReader::new(&stream).read_line(&mut request).is_err() {
        return;
    }

    let (body, kind): (&[u8], &str) = if request.contains("/latest.json") {
        (manifest.as_bytes(), "application/json")
    } else {
        (ARTIFACT, "application/octet-stream")
    };

    // Connection: close, so the client does not wait on a socket this server will never
    // speak on again.
    let head = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
}

/// The manifest the app would fetch, in the shape the plugin expects. The version is
/// absurd on purpose: whatever this crate's version is on the day somebody runs this, 9.9.9
/// is newer, so the test does not quietly stop testing anything after a release.
fn manifest(signature: &str, base: &str) -> String {
    format!(
        r#"{{
          "version": "9.9.9",
          "notes": "a release that does not exist",
          "pub_date": "2026-09-26T00:00:00Z",
          "platforms": {{
            "linux-x86_64": {{ "signature": "{signature}", "url": "{base}/artifact.bin" }}
          }}
        }}"#
    )
}

fn updater(signature: &str) -> tauri_plugin_updater::Updater {
    // mock_builder and not mock_app: the builder is what lets the plugin be registered,
    // and the plugin's setup is what puts the state `updater_builder()` reads. With a bare
    // mock_app the call panics with "state() called before manage()", which reads like a
    // bug in the test and is really the plugin never having been installed.
    let (listener, base) = bind();
    serve(listener, manifest(signature, &base));
    let endpoint = format!("{base}/latest.json");

    // The plugin refuses to initialise without a `plugins.updater` block, and the mock
    // context carries a default configuration rather than this app's. Given here, which is
    // better than reading the real one: this test says what it is testing, and it goes on
    // saying it whatever tauri.conf.json comes to hold.
    let mut context = tauri::test::mock_context(tauri::test::noop_assets());
    context.config_mut().plugins.0.insert(
        "updater".into(),
        serde_json::json!({ "endpoints": [endpoint], "pubkey": PUBKEY.trim() }),
    );

    let app = tauri::test::mock_builder()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .build(context)
        .expect("the mock app would not build");

    use tauri_plugin_updater::UpdaterExt;
    app.handle()
        .updater_builder()
        // Named rather than detected, so the test asserts the same thing on whatever
        // machine runs it.
        .target("linux-x86_64")
        .build()
        .expect("the updater would not build")
}

#[test]
fn an_update_signed_with_our_key_is_accepted() {
    let update = tauri::async_runtime::block_on(async { updater(SIGNATURE.trim()).check().await })
        .expect("checking for updates failed")
        .expect("the manifest offers 9.9.9 and it was not seen as an update");

    assert_eq!(update.version, "9.9.9");

    let bytes = tauri::async_runtime::block_on(update.download(|_, _| {}, || {}))
        .expect("a correctly signed artifact was refused");

    assert_eq!(
        bytes, ARTIFACT,
        "what came back is not what the server served"
    );
}

#[test]
fn an_update_signed_over_other_bytes_is_refused() {
    let refused = tauri::async_runtime::block_on(async {
        let update = updater(SIGNATURE_OF_SOMETHING_ELSE.trim())
            .check()
            .await
            .expect("checking for updates failed")
            .expect("the manifest offers 9.9.9 and it was not seen as an update");

        update.download(|_, _| {}, || {}).await
    });

    // The download is where the verification happens, so this is the line that says the
    // app will not run somebody else's code.
    let error = refused.expect_err("an artifact with an altered signature was accepted");

    // Not just "it failed": a download that failed because the server went away would
    // satisfy that and prove nothing. The error has to be about the signature, which is
    // the only reason this test accepts for saying no.
    // Not just "it failed": a download that failed because the server went away would
    // satisfy that and prove nothing. It has to have failed over the signature, which is
    // the only reason this test accepts for saying no.
    //
    // This assertion is the reason the fixture is a signature of another file rather than
    // a mangled one. With a mangled one it read "Invalid encoding in minisign data": the
    // refusal came from the base64 decoder, before anything was verified at all, and the
    // test passed while proving the wrong thing.
    let said = error.to_string().to_lowercase();
    assert!(
        said.contains("signature"),
        "it refused, but not over the signature: {error}"
    );
}
