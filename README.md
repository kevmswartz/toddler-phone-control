# Roku Control App

A web-based remote control for your Roku device with app launching capabilities.

## Features

- Save Roku IP address in browser localStorage
- Check device status and connection
- View all installed apps
- Launch any app with one click
- Full remote control (navigation, playback, volume, etc.)

## Setup

### Prerequisites
- [Node.js](https://nodejs.org/) 18 or newer
- npm

```bash
npm install
```

### Build Web Assets

The Capacitor projects consume the static assets in `dist/`. Rebuild whenever you make changes:

```bash
npm run build
```

## Running the App

### Android (Capacitor)

```bash
npm run android        # builds web assets, syncs, and opens Android Studio
```

From Android Studio you can run on an emulator or a USB-connected device. The Android project has cleartext traffic enabled so the app can talk to your Roku over HTTP on the local network.

### Windows (Electron)

```bash
npm run sync           # build & sync web assets to all platforms
cd electron
npm install            # only needed the first time
npm run electron:start # build once and launch the desktop shell
```

You can generate a packaged build (folder output) with:

```bash
npm run electron:pack
```

### Browser Preview (CORS limited)

You can still open `index.html` directly or serve `dist/` with any static server, but Roku devices will reject the requests because of CORS unless you run within the same network and disable CORS in the browser. Native builds are the recommended path.

## Why Capacitor?

The Roku External Control Protocol does not send CORS headers, so browser-based fetches are blocked. The Capacitor builds ship with the native HTTP plugin, letting the app call the Roku over the local network without any extra proxy or cloud hosting.

## Kid Button Content

- Generate or edit `toddler-content.json` with the CLI:
  ```bash
  npm run content -- list
  npm run content -- add-quick --id babyShark --label "Baby Shark" --type youtube --videoId OBqZDyVlFP8
  npm run content -- add-special --id bedtime --label "Bedtime" --emoji "🌙" --handler runFavoriteMacro --zone quick
  ```
  Use `npm run content -- --help` to see all commands (init, add-special, add-quick, remove, list).
- Commit the JSON to your git repo (for example on GitHub) and copy the raw file URL.
- In the app’s Settings (after unlocking), paste the raw URL into **Kid Button Source** and click **Save URL & Refresh**. The Electron/Android apps will cache the remote JSON for offline use; you can refresh or clear the cache anytime.

## Finding Your Roku IP

1. On your Roku, go to **Settings**
2. Select **Network**
3. Choose **About**
4. Note the IP address and add port `:8060` if your Roku doesn’t display one (for example `192.168.1.120:8060`)

## API Endpoints Used

- `GET /query/device-info` - Device information
- `GET /query/apps` - List installed apps
- `POST /launch/{app-id}` - Launch an app
- `POST /keypress/{key}` - Send remote button press

## Supported Keys

- Navigation: Up, Down, Left, Right, Select, Back, Home
- Playback: Play, Pause, Rev, Fwd, InstantReplay
- Volume: VolumeUp, VolumeDown, VolumeMute
- Power: PowerOff
- Misc: Info, ChannelUp, ChannelDown

## Future Enhancements

- Sound playback functionality
- Keyboard text input
- App favorites/quick launch
- Multiple Roku device support
- Custom macros/sequences
