# PixelBoy

A pocket-sized painting and animation program with Photoshop-style tools and shortcuts, a Flash-style timeline, and a retro handheld look. Runs as a Windows desktop app (auto-updates from GitHub) and as a web app (for itch.io).

## Download

| | |
|---|---|
| **Windows** | [**PixelBoy-Setup.exe**](https://github.com/keithburgun/pixelboy/releases/latest/download/PixelBoy-Setup.exe) — run the installer; PixelBoy then keeps itself up to date. |
| **Web / HTML** | [**pixelboy-web.zip**](https://github.com/keithburgun/pixelboy/releases/latest/download/pixelboy-web.zip) — unzip and open `index.html` in Chrome or Edge, or upload the zip to itch.io. |
| **Play in browser** | [keithburgun.github.io/pixelboy](https://keithburgun.github.io/pixelboy/) |

Windows may show a SmartScreen warning the first time because the installer isn't code-signed: click **More info → Run anyway**.

All versions: [Releases](https://github.com/keithburgun/pixelboy/releases)

## Run it locally

1. Install [Node.js](https://nodejs.org) 20 or newer.
2. In this folder: `npm install`, then `npm start`.

You can also just open `app/index.html` in Chrome or Edge — the web version is the same code.

## One-time GitHub settings

- **Settings → Actions → General → Workflow permissions:** Read and write (lets the release workflow publish releases).
- **Settings → Pages → Source:** GitHub Actions (turns on the play-in-browser link).

## Release an update

```
npm version patch --no-git-tag-version   # 0.1.0 -> 0.1.1 (use "minor" for bigger releases)
git commit -am "Release 0.1.1"
git push
```

(Or just edit `"version"` in `package.json` on GitHub and commit.)

When the version changes on `main`, the GitHub Action (`.github/workflows/release.yml`) builds the Windows installer, publishes a GitHub Release, and attaches `pixelboy-web.zip`; `pages.yml` updates the browser version. Installed copies check GitHub a few seconds after launch, download the update in the background, and show **Restart to Update** in the status bar. *Help → Check for Updates* checks on demand.

The installer isn't code-signed, so Windows SmartScreen will warn the first time someone installs it ("More info → Run anyway"). Updates still work.

## Web version (itch.io)

`npm run build:web` writes `dist/pixelboy-web.zip`. On itch.io, create a project with *Kind of project: HTML*, upload the zip, and tick *This file will be played in the browser*.

## Brushes

PixelBoy ships with 13 original brushes. To add more, use **File → Import Brushes (.abr)** (or drag an `.abr` file onto the window) — it reads Photoshop sampled-tip brushes, including size/angle/scatter/pressure settings where present. Imported brushes are remembered. **File → New Brush Tip from Image** turns any picture into a brush (dark = paint). Check each brush pack's license before redistributing it.

## Shortcuts (all rebindable: Edit → Keyboard Shortcuts, Ctrl+Alt+Shift+K)

| | |
|---|---|
| **Tools** | V Move · M Marquee (Shift+M cycles rect/ellipse/row/column) · L Lasso / Polygonal · W Magic Wand · I Eyedropper · B Brush / Pixel Brush (Shift+B) · E Eraser · G Paint Bucket · H Hand · R Rotate View · Z Zoom |
| **Held keys** | Space = Hand · Alt = Eyedropper (while painting tools) · Ctrl-drag = Move · Alt+right-drag = brush size (horizontal) / hardness (vertical) · Shift-click = straight line |
| **Brush** | `[` `]` size · Shift+`[` `]` hardness · 1–0 opacity (type two digits for exact, e.g. 4 5 = 45%) · Shift+1–0 flow · X swap colors · D default colors |
| **Edit** | Ctrl+Z / Ctrl+Shift+Z undo/redo · Ctrl+X/C/V · Ctrl+Shift+C copy merged · Delete clear · Alt+Backspace fill foreground · Ctrl+Backspace fill background |
| **Select** | Ctrl+A all · Ctrl+D deselect · Ctrl+Shift+D reselect · Ctrl+Shift+I inverse · Shift add · Alt subtract · Shift+Alt intersect |
| **Layers** | Ctrl+Shift+N new · Ctrl+J layer via copy / duplicate · Ctrl+E merge down · Ctrl+`[` `]` move · Alt+`[` `]` select below/above · `/` lock transparency · number keys set layer opacity when a non-painting tool is active |
| **View** | Ctrl+0 fit · Ctrl+1 100% · Ctrl+= / Ctrl+- zoom · Alt/Ctrl+wheel zoom · Ctrl+' pixel grid · Tab hide panels |
| **Animation (Flash)** | Ctrl+Alt+T timeline · Enter play/stop · `,` `.` previous/next frame · F5 insert frame · Shift+F5 remove frame · F6 keyframe · F7 blank keyframe · Shift+F6 clear keyframe · Alt+Shift+O onion skin |

Photoshop uses F5 for Brush Settings; here F5–F7 go to the timeline (Flash), and Brush Settings is a tab in the Brushes panel.

## Files

- `.pixelboy` — native project (all layers, frames, timing)
- `.psd` — open and save layered Photoshop files (one frame; layer groups are flattened on open)
- PNG / JPG export (with scaling), animated GIF, sprite sheet PNG

## Project layout

```
app/          the program (HTML/CSS/JS) — shared by desktop and web
  js/         engine, tools, UI, timeline, file formats
  vendor/     ag-psd (PSD/ABR, MIT), gifenc (GIF, MIT)
electron/     desktop shell: window, file dialogs, auto-updater
scripts/      web zip builder, version sync
.github/      release workflow
```
