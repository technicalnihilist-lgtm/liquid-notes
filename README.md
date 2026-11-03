# Liquid Notes

An installable, offline-first note taking app with a liquid-glass interface — a real
Progressive Web App, plus a native Android APK built automatically by GitHub Actions.

- **Web / PWA:** open the Pages URL and use *Add to Home Screen* — it installs like an app and works with no network.
- **Android:** download the APK from [Releases](../../releases) — Android 7.0+ (API 24), **zero permissions**, fully offline.

![Liquid Notes on desktop](screenshots/desktop.png)

## What it does

Notes are stored on the device (localStorage) — nothing leaves your phone or browser, there is no account and no server.

- Create, edit, search and delete notes with autosave on every keystroke
- Hold a note in the list to reveal its delete button (with haptic feedback)
- Live word and character count
- Export all notes as **JSON** or **Markdown**, and import a JSON export back
- Light, dark and auto themes that follow your system setting
- Four background palettes (Aurora, Sunset, Ocean, Mono) and five accent colours
- Real glass tuning: blur, transparency, colour boost, corner radius, text size
- Parallax depth and 3D tilt driven by pointer movement or device orientation
- Animated open/close with a launcher icon, plus an optional sound effect
- Full offline support through a service worker, and an in-app install button

### Screenshots

| Dark mode | Settings | Mobile |
| --- | --- | --- |
| ![Dark](screenshots/desktop-dark.png) | ![Settings](screenshots/desktop-settings.png) | ![Mobile](screenshots/mobile.png) |

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl`/`Cmd` + `N` | New note |
| `Ctrl`/`Cmd` + `F` | Focus search |
| `Esc` | Close the settings panel |

## Run it locally

No build step, no dependencies — it is plain HTML, CSS and JavaScript.

```bash
git clone https://github.com/technicalnihilist-lgtm/liquid-notes.git
cd liquid-notes
python3 -m http.server 8000
# open http://localhost:8000
```

Serve it over `http://` (not `file://`) so the service worker can register and the
app becomes installable.

## Build the Android APK

The `android/` folder is a minimal, dependency-free WebView shell. It has no
libraries at all — no AppCompat, no Capacitor — so the whole APK is a few hundred
kilobytes. The Gradle `copyWebAssets` task mirrors the web app at the repository
root into the APK's assets, so there is only one copy of the source.

```bash
cd android
gradle assembleDebug
# android/app/build/outputs/apk/debug/app-debug.apk
```

You need JDK 17 and Gradle 8.7+. In CI this happens on every push to `main` and on
every `v*` tag, and the APK is attached to the matching GitHub Release.

> The APK is signed with the standard Android debug key, restored from the Actions
> cache so consecutive builds install over each other. For the Play Store, add your
> own keystore and a `signingConfigs.release` block in `android/app/build.gradle`.

## Project layout

```
index.html               app shell
styles.css               liquid glass styling (all tuning via CSS variables)
app.js                   state, rendering, settings, export/import, animations
manifest.webmanifest     PWA manifest (installable, standalone, shortcuts)
sw.js                    service worker — caches the app shell for offline use
icons/                   generated app icons (192, 512, maskable, apple-touch)
screenshots/             captured from the running app with headless Chromium
android/                 WebView APK project (Java, no dependencies)
.github/workflows/       builds the APK and publishes it to Releases
```

## Privacy

No analytics, no network calls, no permissions. The Android build does not even
request `INTERNET`; the web build makes no requests other than loading its own
files. Your notes live in your browser's or WebView's local storage on your device.

## License

MIT — see [LICENSE](LICENSE).
