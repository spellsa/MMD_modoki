# MMD modoki

MMD modoki is a local editing tool inspired by MMD, built on top of Babylon.js Editor and `babylon-mmd`.  
It can load PMX/PMD models, accessories, VMD motion data, camera VMD data, and audio files for timeline editing, preview, and PNG export.

MMD modoki is under active development with the goal of becoming an alternative tool for environments where the original MMD cannot run.  
Builds for Windows, Linux, and macOS are being verified incrementally.  
Support is planned for English, Japanese, Traditional Chinese, Simplified Chinese, and Korean.

## Download

- Releases: https://github.com/togechiyo/MMD_modoki/releases

Distributed builds are provided as zip archives for each OS.

- `mmd-modoki-windows-x64-zip.zip`
- `mmd-modoki-macos-x64-zip.zip`
- `mmd-modoki-linux-x64-zip.zip`

## Launch

1. Download the zip file for your OS from `Releases`.
2. Extract the zip file.
3. Launch the application in the extracted folder.

Windows:
- `MMD modoki.exe`

macOS:
- `MMD modoki.app`

Linux:
- Depending on your environment, the Linux build may need to be launched with `--no-sandbox`.
- This is a temporary workaround to avoid startup failures related to `chrome-sandbox`.
- Launch the executable directly from the extracted folder.

## First Launch Notes

- The macOS build is unsigned, so Gatekeeper warnings may appear.
- The Linux build may require additional libraries depending on the environment.
- As this is still an early version, the save format and UI may change.

## Features

- Load PMX/PMD models
- Load `.x` accessories
- Load VMD motions and camera VMD data
- Load MP3/WAV audio
- Edit on a timeline
- Adjust bones, morphs, camera, and lighting
- Save PNG images and numbered PNG sequences
- Adjust post effects such as DoF, Bloom, and LUT

Notes:
- SSAO is currently always disabled in public builds to reduce load.
- Anti-aliasing uses `MSAA x4 + FXAA`.

## Supported File Types

Available through normal open operations or drag and drop:

- Models: `.pmx` `.pmd`
- Accessories: `.x`
- Motion / pose: `.vmd` `.vpd`
- Camera motion: `.vmd`
- Audio: `.mp3` `.wav`

Available from dedicated UI:

- Project: `.json` (default file name pattern: `*.modoki.json`)

Notes:

- `.vmd` files are loaded either as model motion or camera motion depending on their contents.
- `.x` files are expected to be text-format DirectX X files.

## Basic Controls

- `Ctrl + O`: Open PMX/PMD
- `Ctrl + M`: Open VMD
- `Ctrl + Shift + M`: Open camera VMD
- `Ctrl + Shift + A`: Open audio
- `Ctrl + S`: Save project / overwrite save
- `Ctrl + Alt + S`: Save as
- `Ctrl + Shift + S`: Save PNG
- `Space` or `P`: Play / stop
- `Delete`: Delete selected keyframes

Mouse:
- Middle-button drag: Move view
- Right drag: Rotate
- Wheel: Zoom

## Development

Requirements:
- Node.js 18 or later
- npm

Setup:

```bash
npm install
```

Run in development:

```bash
npm start
```

Lint:

```bash
npm run lint
```

Build distributables:

```bash
npm run package
npm run make
```

Create zip packages:

```bash
npm run make:zip
```

## Documentation

- Documentation entry point: [docs/README.md](./docs/README.md)
- Architecture: [docs/architecture.md](./docs/architecture.md)
- MmdManager guide: [docs/mmd-manager.md](./docs/mmd-manager.md)
- UI flow: [docs/ui-flow.md](./docs/ui-flow.md)
- Troubleshooting: [docs/troubleshooting.md](./docs/troubleshooting.md)

## License

- This project: [MIT](./LICENSE)
- Third-party notices: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
