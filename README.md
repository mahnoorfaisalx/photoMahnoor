# PhotoMahnoor

PhotoMahnoor is a lightweight image editor that runs in the browser. It mixes layer-based photo editing (like Photoshop), design tools (like Canva) and screenshot annotation.

All editing happens in your browser. Your images are never uploaded anywhere, and you don't need an account or an API key.

![stack](https://img.shields.io/badge/React-19-61dafb) ![fabric](https://img.shields.io/badge/Fabric.js-6-orange) ![vite](https://img.shields.io/badge/Vite-8-646cff)

---

## Quick start

Requirements: **Node.js 20+** (tested with Node 22) and a modern Chromium, Firefox or Safari browser.

```bash
npm install
```

```bash
npm run dev
```

Then open the URL that Vite prints (normally http://localhost:5173).

To make a production build and preview it:

```bash
npm run build
```

```bash
npm run preview
```

`npm run build` writes a fully static site to `dist/`. You can host that folder on any static host (GitHub Pages, Netlify, an S3 bucket, `python -m http.server`, and so on). The build uses relative paths, so it also works from a sub-folder.

### Running the end-to-end test

The project includes a Playwright test that drives the real app. It imports an image, annotates it, adjusts it, uses undo/redo, removes an object, crops, saves, reloads and reopens the project, round-trips a project file, exports PNG/JPG/WebP, removes the background, and runs a batch job.

```bash
npx playwright install chromium
```

```bash
npm run build && npm run test:e2e
```

---

## Features

### Canvas
* Zoom with Ctrl/⌘ + wheel, pinch, the + and − keys, Fit (Ctrl+0) or 100% (Ctrl+1).
* Pan with the wheel or trackpad, Space + drag, the middle mouse button, or the Hand tool.
* Drag and drop image files, or a `.pmproj` project, anywhere onto the canvas.
* Copy and paste:
  * Paste screenshots and images straight from the clipboard (Ctrl+V).
  * Copy, cut and paste layers inside the editor.
  * **Copy as PNG** (Ctrl+Shift+C) sends the selected layers, or the whole canvas, to the system clipboard.
* Custom canvas sizes, plus about 20 built-in presets (Instagram, Story, YouTube thumbnail, A4, 4K…). You can also **save your own size presets**.

### Transform and adjust
* **Crop** with aspect presets (free, 1:1, 4:3, 3:2, 16:9, 9:16, 4:5) and a rule-of-thirds overlay.
* **Image size** scales the content. **Canvas size** keeps the content scale and has a 9-point anchor.
* **Trim** fits the canvas to the content or the selection.
* **Rotate** the canvas by ±90° or 180°, and **flip** it horizontally or vertically. Rotate and flip also work on single layers.
* **Adjustments** are non-destructive and per image layer:
  * Light and colour: exposure, brightness, contrast, saturation, vibrance, temperature, tint, hue.
  * Detail: sharpness, blur, grain, pixelate.
  * Filters: B&W, sepia, vintage, invert.
* **Looks**: one-click presets such as Vivid, Warm, Noir and Dramatic. You can **save your own looks**.

### Layers
* Image, text, shape, drawing, annotation, effect and group layers.
* Visibility, lock, opacity, blend modes (multiply, screen, overlay…), rename (double-click), drag-to-reorder, duplicate, delete, group and ungroup.
* Alignment to the canvas, or to each other when several layers are selected.
* X/Y/W/H/rotation fields.

### Text and design
* Text with 20 Google Fonts and the common system fonts.
* Text settings: size, line height, letter spacing, bold, italic, underline, strikethrough, alignment, highlight background, outline.
* **Text style presets** (Heading, Meme, Neon, Label, Code…). You can save your own.
* Shapes: rectangle (with rounded corners), ellipse, triangle, star, hexagon, diamond, heart, speech bubble, line, and freehand pen.
* **Fills**: solid, linear gradient (with angle) or radial gradient, on both shapes and text.
* **Strokes**, including dashed strokes, and **drop shadows and glows** on any layer.

### Screenshot tools
* **Arrows and lines** with draggable end points, single or double heads, dashed style and adjustable head size.
* **Highlight** boxes (multiply blend), a freehand **highlighter**, and numbered **step markers** that count up automatically.
* **Blur** and **pixelate** regions. They are live, non-destructive regions that stay editable and movable.
* **Redaction**: solid boxes. The exported file contains only the box, so the hidden content can't be recovered.
* **Rounded corners**, for the whole canvas or for individual images.
* **Screenshot frame**: one click adds a gradient background, padding, rounded corners and a soft shadow.

### AI and smart features
| Feature | How it works |
|---|---|
| **Background removal** | ISNet segmentation via [`@imgly/background-removal`](https://github.com/imgly/background-removal-js). It runs fully in the browser on WebAssembly/WebGPU. The model is downloaded once from the imgly CDN and then cached. You can choose a Fast, Balanced or Best model. |
| **Quick background removal** | An offline fallback that segments solid or simple backgrounds by colour, starting from the image borders. If the AI model can't load (offline or blocked), the app switches to it automatically. |
| **Background replacement** | Puts a colour, a gradient, an image, or a blurred copy of the original behind the cut-out subject. |
| **Smart selection** | **Select subject** (AI), plus the **magic wand** (colour tolerance, contiguous or global), **lasso**, **rectangle** and **brush** selection. Shift adds to a selection and Alt subtracts. |
| **Object removal** | Paint over an object, or select it any other way, and click **Remove object**. A built-in content-aware fill (multi-scale diffusion plus patch matching) fills the area. The result is a separate *patch layer* that you can hide or delete, so the original stays untouched. |
| **Selection actions** | Extract to a new layer, fill, blur, pixelate, erase from a layer, invert, crop to the selection, copy as PNG. |

The AI features run in the background. If one of them fails, the rest of the editor keeps working.

### Non-destructive editing, undo and shortcuts
* Adjustments are stored as parameters, and the original pixels are always kept.
* Background removal keeps the original as a hidden layer.
* Object removal creates a patch layer instead of changing the image.
* Undo and redo are unlimited within a session (the last 80 steps), with Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y.
* There is a full set of keyboard shortcuts. Press **?** in the app to see them. The most common ones:

| Key | Tool | | Key | Command |
|---|---|---|---|---|
| V | Select | | Ctrl+Z / Ctrl+Shift+Z | Undo / Redo |
| H / Space | Hand | | Ctrl+C / X / V / D | Copy / Cut / Paste / Duplicate |
| C | Crop | | Ctrl+S | Save to library |
| T | Text | | Ctrl+Shift+S | Download project file |
| R / O / L / P | Rect / Ellipse / Line / Pen | | Ctrl+E | Export |
| A | Arrow | | Ctrl+G / Ctrl+Shift+G | Group / Ungroup |
| G / I | Highlight box / Highlighter | | Ctrl+] / Ctrl+[ | Move layer up / down |
| B / X / K | Blur / Pixelate / Redact | | Arrows | Nudge (Shift = 10px) |
| N | Step number | | Delete | Delete layer / remove selected area |
| M / Q / W / S | Marquee / Lasso / Wand / Brush select | | Esc / Enter | Deselect / apply crop |
| E | Eyedropper | | Ctrl+0 / Ctrl+1 | Fit / 100% |

### Projects and export
* **Save to library** (Ctrl+S) stores projects in the browser's IndexedDB, with thumbnails. Projects also **autosave** while you work, and recent projects appear on the start screen.
* **Download project** (Ctrl+Shift+S) saves a `.pmproj` file. It's a single JSON file with all images embedded, and you can reopen it anywhere with *File → Open project* or by dragging it onto the app.
* **Export** to PNG, JPG or WebP, with a live preview, a quality setting, a 0.25×–3× scale and a file-size estimate. You can also copy the result to the clipboard.

### Batch processing
*File → Batch process* (Ctrl+Shift+B) applies one recipe to many images and downloads the results as a ZIP. A recipe can:
* resize (fit within, crop to fill, exact size, or a percentage)
* rotate or flip
* apply any look or adjustment preset
* remove the background (AI or quick)
* add a background colour, rounded corners, padding, or a text watermark
* set the output format, quality and file-name pattern (`{name}`, `{n}`)

You can save recipes and load them again later.

---

## Can my ChatGPT subscription power the AI features?

**Short answer: not today. This app uses free in-browser models instead.**

OpenAI now has a feature called **"Sign in with ChatGPT"**. It lets some third-party apps run requests against a subscriber's ChatGPT plan allowance instead of separate API billing. For open-source clients there is also an OAuth flow with dynamic client registration and PKCE that needs no client secret. However:

* It is a **limited preview**. Many reports describe it as invite-only, and launch partners are listed individually (Notion, Devin, Vercel, Warp and others). Apps need a registered OpenAI OAuth client and exact redirect URIs.
* According to OpenAI and press coverage, signing in **does not make a subscription a general API substitute**. Anyone building a product on OpenAI's API still needs normal API billing.
* None of the documentation found during research covers **image generation or image editing** (the operations needed for background or object removal) through this flow.
* The official developer docs (developers.openai.com/siwc) could not be reached from the environment where this app was built, so the integration could not be implemented and tested safely.

For these reasons, and because the requirements said not to let AI integrations block the app, every AI feature here uses **free, open-source models that run locally in the browser**, with offline fallbacks. If Sign in with ChatGPT becomes generally available for this kind of use, it could be added as an extra provider in `src/editor/ai.ts`.

Sources:
* [OpenAI makes 'Sign in with ChatGPT' a way to use your subscription in third-party developer tools (daily.dev)](https://daily.dev/posts/openai-makes-sign-in-with-chatgpt-a-way-to-use-your-subscription-in-third-party-developer-tools-7ewaoo6ze)
* [OpenAI Lets ChatGPT Plus and Pro Users Spend Their Plan Limits in Third-Party Apps (xenospectrum)](https://xenospectrum.com/en/chatgpt-sign-in-subscription-apps/)
* [Sign in with ChatGPT shares your name and email, and only invited sites get it (mixed-news)](https://mixed-news.com/en/?p=35164)
* [OpenAI developer docs – Sign in with ChatGPT](https://developers.openai.com/siwc/quickstart)

---

## Architecture

```
src/
  editor/
    editor.ts       core engine: Fabric canvas, document, tools, history, pixel selection, export, projects
    objects.ts      custom Fabric classes: Arrow (draggable end points), EffectRegion (live blur/pixelate)
    adjustments.ts  adjustment model and its mapping to Fabric WebGL filters, plus look presets
    ai.ts           background removal, subject selection, background replacement (imgly + fallback)
    batch.ts        batch pipeline and ZIP output
    projects.ts     IndexedDB library, autosave, .pmproj import/export
    presets.ts      canvas-size / look / text-style / batch-recipe presets (localStorage)
    shapes.ts       shape paths, font list, text styles
    commands.ts     shared commands (open, save…)
  lib/imageOps.ts   pixel algorithms: box blur, flood fill, inpainting, colour-key matting
  components/       React UI: menu bar, toolbar, tool options, properties, adjust, AI, layers, dialogs
  store.ts          Zustand UI state
tests/e2e.cjs       Playwright end-to-end workflow test
```

* **Stack**: React 19, TypeScript, Vite, Fabric.js 6 (canvas, objects, WebGL filters), Zustand, JSZip, lucide icons, `@imgly/background-removal` (lazy-loaded).
* **Document model**: the canvas content is a list of Fabric objects with custom properties (`id`, `name`, `layerType`, `locked`, `adjust`…). Undo snapshots and project files are Fabric JSON. While you edit, images are referenced by `blob:` URLs. When a project is saved, they are embedded as data URLs (in `.pmproj` files) or Blobs (in IndexedDB).
* **Export** re-renders the document on an off-screen `StaticCanvas` at the requested scale, so the output never depends on the current zoom level.

---

## Deployment

**Single-file build**: `npm run build:single` writes the whole app into one self-contained `dist-single/index.html` (about 0.8 MB) that you can open straight from disk or share. To keep the file small, this build leaves out the AI model runtime, so background removal uses the quick offline engine.

The output of `npm run build` is static. The repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that builds the app and publishes it to **GitHub Pages** whenever you push to `main`, or when you run the workflow manually. To turn it on, go to *Settings → Pages* and set **Source** to "GitHub Actions". No other accounts or secrets are needed.

---

## Known limitations

* **AI model download**: the first time you remove a background, the browser downloads the model (about 40–170 MB depending on the quality setting) from `staticimgly.com`, and then caches it. If that host is blocked, or you are offline, the app uses the quick colour-based removal instead. That works well for plain backgrounds (product shots, screenshots, studio photos) but not for complex scenes.
* **Object removal** is a classic content-aware fill, not a generative model. It works very well for objects on fairly uniform or textured backgrounds (skies, walls, grass, UI backgrounds). It works less well on large objects in front of complex structure. Large areas are processed at reduced resolution for speed.
* **Click-to-segment** (SAM-style) selection isn't included. Smart selection uses AI subject detection plus magic wand, lasso and brush.
* **Cropping a single image layer** is not available; *Crop* crops the whole canvas. To trim one layer, use a selection with *Extract* or *Erase from layer*.
* **Editing very large images** (above about 50 MP) can be slow on low-end devices. WebGL filters are limited by the GPU's maximum texture size.
* **Clipboard**: writing images to the clipboard needs a secure context (https or localhost) and a supporting browser. Copying layers inside the editor always works.
* **Licensing**: `@imgly/background-removal` is AGPL-3.0. If you distribute a modified version of this app publicly, keep the source available, or swap in a different model.
