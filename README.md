# zoruneOS

zoruneOS is a dark, browser-based desktop prototype with draggable app windows, a searchable Start menu, and local browser apps. It is an early preview, not a bootable computer operating system or a production-ready public service.

## Run locally

### Requirements

- Node.js 18 or newer
- Windows PowerShell, Command Prompt, or another terminal

### Start

1. Open this project folder in VS Code.
2. Choose **Terminal → New Terminal**.
3. If dependencies are not installed yet, run `npm.cmd install` in PowerShell.
4. Run `node server.js` (or `npm.cmd start`).
5. Open the exact `http://localhost:...` address printed in the terminal. Keep the terminal open while using zoruneOS; press **Ctrl+C** there to stop the server.

Use the Node server address, not VS Code Live Server. The Browser, Global Chat, and Movies catalog need the Node server. Locally, it listens only on this computer (`127.0.0.1`). On Railway, it uses Railway's `PORT` and binds to `0.0.0.0` so the deployment can receive traffic. For other container hosts, set `HOST=0.0.0.0`.

## Account setup

Start the app with `node server.js` and keep that terminal open. When no owner account exists, the server prints a first-account setup code in the terminal. Open the exact `http://localhost:...` address printed by the server, choose **create an account**, and enter that code on the account setup screen. The first account becomes the owner; the code can only be used once. If you restart the server before creating the account, use the new code printed at startup. Choose **continue as guest** to skip account setup and use local apps without Global Chat.

## TMDB setup

Movies can browse trending titles and search the TMDB catalog. To enable it, create an **API Read Access Token** in your TMDB account. Stop the server with **Ctrl+C**, then set the token in the VS Code PowerShell terminal before starting zoruneOS again:

```powershell
$env:TMDB_READ_ACCESS_TOKEN = "paste-your-read-access-token-here"
node server.js
```

The token is read by the server and is not stored in app code. It must be set again in a new terminal session. Keep it private; never commit it or paste it into a public issue. See the [TMDB getting started guide](https://developer.themoviedb.org/docs/getting-started) and [authentication guide](https://developer.themoviedb.org/docs/authentication-application).

TMDB provides catalog information and artwork, not movie streams. To play a movie in zoruneOS, use a browser-playable direct media URL or a video file you have access to. Streaming-site pages and DRM-protected sources generally cannot be played in the built-in player.

## Apps

- **Files** organizes uploaded files for the current browser session; folder names stay in local browser storage.
- **Browser** uses Scramjet and the local Wisp endpoint; searches use DuckDuckGo.
- **Global Chat** provides one shared channel with member, moderator, and owner roles.
- **Continue as guest** opens the desktop without an account; local apps work, but Global Chat, profile, and shop require signing in.
- **Movies** searches trending and matching TMDB titles, shows posters and details, and includes a direct-link/local-file video player.
- **App Creator** edits HTML, CSS, and JavaScript, previews the result in an isolated frame, saves the draft in this browser, and downloads a standalone HTML file.
- **Music** plays audio files selected from your device during the current session.
- **Settings** saves preferences in local browser storage on this device.
- **Paint** draws and exports PNG files.
- **Camera** requests camera permission and can save snapshots.
- **Clock** includes the live clock, stopwatch, and timer.
- **Calculator** supports mouse and keyboard input.
- **Games** lets you choose between LuminSDK and gn-math; the local tic-tac-toe fallback is available if LuminSDK is offline.
- **Terminal** is a safe in-app command preview. It does not run commands on your computer.

Global Chat stores user records and messages in `data/chat-store.json`. That runtime data is excluded from Git by `.gitignore`; back it up separately if you need to keep it.

## Checks

Run `npm.cmd run check` to check the JavaScript syntax for the client and server.

## Before a public launch

This code is prepared for source control, but the local server is not ready to be exposed directly to the internet. It includes an unauthenticated Wisp proxy endpoint, in-memory login sessions, and no login rate limiting. A hosted release needs a security review, abuse controls, durable session and chat storage, and HTTPS behind a suitable deployment setup.

No software license has been selected yet. Choose a license and add a `LICENSE` file before presenting a public source repository as open source. The `private` setting in `package.json` prevents accidental npm package publication; it does not prevent publishing this project to a Git host.
