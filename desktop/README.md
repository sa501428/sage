# SAGE Desktop

SAGE Desktop is a small native host for the existing local-first SAGE web app.

The host uses system webviews instead of Electron:

- macOS: `WKWebView` from WebKit and Cocoa.
- Windows: Microsoft Edge WebView2.

This keeps the desktop build small while avoiding a rewrite of the image editor and annotation UI. A full native C++ rewrite can still happen later, but it would need to replace browser-provided image decoding, canvas rendering, file pickers, downloads, and editor interactions.

## Icons

Desktop icons are generated from `desktop/logo.bands.png`.

```sh
swift desktop/tools/generate_icons.swift
```

This writes:

```text
desktop/icons/SAGE.icns
desktop/icons/SAGE.ico
```

## Security Posture

- The app loads bundled files only.
- External navigation is blocked.
- Network requests are blocked by the web app CSP.
- macOS uses a non-persistent `WKWebsiteDataStore`.
- Windows uses an ephemeral WebView2 user data directory and disables background networking where WebView2 supports Chromium flags.
- Dev tools, host objects, and WebView web messaging are disabled where supported.

## Build on macOS

```sh
cmake -S desktop -B build/desktop-macos -DCMAKE_BUILD_TYPE=Release
cmake --build build/desktop-macos --config Release
cmake --build build/desktop-macos --target package --config Release
```

The app bundle is written to:

```text
build/desktop-macos/SAGE.app
```

The DMG installer is written to:

```text
build/desktop-macos/SAGE-0.1.0-Darwin.dmg
```

## Build on Windows

Install the WebView2 SDK package, then build with Visual Studio CMake:

```powershell
choco install wixtoolset -y --no-progress
nuget install Microsoft.Web.WebView2 -Version 1.0.3351.48 -OutputDirectory desktop\vendor
cmake -S desktop -B build\desktop-windows -G "Visual Studio 17 2022" -A x64 -DWEBVIEW2_ROOT="$PWD\desktop\vendor\Microsoft.Web.WebView2.1.0.3351.48"
cmake --build build\desktop-windows --config Release
cmake --build build\desktop-windows --target package --config Release
```

The executable is written to:

```text
build\desktop-windows\Release\SAGE.exe
```

The `app` asset directory must stay beside `SAGE.exe`.

The MSI installer is written to:

```text
build\desktop-windows\SAGE-0.1.0-Windows.msi
```

The MSI installs the executable and bundled `app` assets. It expects the Microsoft Edge WebView2 Runtime to be present, which is normally already installed on current Windows 10 and Windows 11 systems.

## CI Artifacts

GitHub Actions builds a macOS DMG and Windows MSI from `.github/workflows/desktop.yml`.
