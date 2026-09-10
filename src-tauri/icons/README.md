# Tauri icons

Generate the required icon set from a source PNG (min 1024×1024) with:

```bash
npm run tauri icon path/to/source.png
```

This will produce all sizes referenced by `tauri.conf.json`:
- 32x32.png, 128x128.png, 128x128@2x.png
- icon.icns (macOS)
- icon.ico (Windows)
- Square150x150Logo.png, etc. (Windows Store)

You can start from the SVG at `../public/icon.svg` — export it to a 1024×1024 PNG first.
