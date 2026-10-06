# VideoMaMa++ — project page

Static project page built from the NeurIPS supplementary material
(`Neurips_supplementary/youtube_curated/html`). No build step, no dependencies —
just open it or push it to GitHub Pages.

```
project_page/
├── index.html                 ← all page text lives here
├── .nojekyll                  ← stops GitHub Pages running Jekyll over the files
├── source/                    ← originals, never edited by the tools
│   ├── _NeurIPS_2026__LongMaMa.pdf   ← the paper
│   └── figures/               ← paper figures as PDF (main_arch, main_qual_long, ...)
├── static/
│   ├── css/style.css          ← light + dark theme
│   ├── js/data.js             ← clip + method inventory (generated)
│   ├── js/pair.js             ← hero: input | VideoMaMa | VideoMaMa++
│   ├── js/slider.js           ← drag-divider comparison
│   ├── js/comparison.js       ← all-methods grid + theme toggle
│   └── images/                ← web versions of the figures (generated)
├── videos/                    ← 9 clips × (2 inputs + 6 methods × 2 outputs), 52 MB
└── tools/
    ├── regenerate.py          ← rescan videos/ and rewrite the clip list
    ├── temporal_stats.py      ← optional: frame-to-frame alpha change per clip (analysis only)
    └── export_figures.py      ← render source/figures/*.pdf into static/images/
```

## Paper figures

The figure PDFs in `source/figures/` are the originals. Browsers cannot show a
PDF in an `<img>`, so `tools/export_figures.py` (needs `pip install pymupdf`)
renders each one to a 2000-px-wide image in `static/images/`:

| Source PDF | Web image | Paper figure |
|---|---|---|
| `main_arch.pdf` | `method.png` | Fig. 2, training + inference overview |
| `main_qual_long.pdf` | `long_video.jpg` | Fig. 3, long-video consistency |
| `interactive_qual.pdf` | `interactive.jpg` | Fig. 4a, interactive refinement |
| `mad_paper_relative.pdf` | `anchor_plot.png` | Fig. 4b, MAD by chunk index |

To update a figure, replace its PDF and rerun the script. Everything under
`source/` is published with the page if the folder is pushed to GitHub Pages
(the 24 MB paper is well under GitHub's 100 MB per-file limit); leave `source/`
out of the repo, or add it to a `.gitignore`, if the PDFs should stay private.

## Preview locally

```bash
cd project_page
python3 -m http.server 8000
# → http://localhost:8000
```

Open it over HTTP, not as a `file://` path — browsers block some video loading otherwise.

## Deploy to GitHub Pages

```bash
cd project_page
git init -b main
git add -A
git commit -m "VideoMaMa++ project page"
git remote add origin git@github.com:<USER>/<REPO>.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
The page appears at `https://<USER>.github.io/<REPO>/` within a minute or two.

The 52 MB of video is well under GitHub's 1 GB soft limit for Pages, so the
videos can go in the repo as ordinary files — no Git LFS needed.

## Changing the clips or methods

Add or remove folders under `videos/`, keeping the layout:

```
videos/<clip>/rgb.mp4
videos/<clip>/mask.mp4
videos/<clip>/<Method>/pred_alpha.mp4
videos/<clip>/<Method>/pred_greenscreen.mp4
```

Every video of a clip must have the same number of frames, starting at the
same source frame. The players follow the input video's clock and loop when it
ends, so a longer method video plays frames the input never shows and drifts
out of sync near the end. Cut longer ones to the shortest, e.g.
`ffmpeg -i in.mp4 -vf trim=end_frame=N -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart out.mp4`.

then:

```bash
python3 tools/regenerate.py
```

That rescans `videos/` and rewrites the `DATA` block in `static/js/data.js`.
Clip order is set by `ORDER` in `static/js/data.js`, just below that block, and
is shared by all three viewers, so dot N is the same clip everywhere. Clips not
listed in `ORDER` follow at the end. If a method is missing for some clip,
the script emits an availability map and that panel renders "Not available"
instead of breaking.

To rename a method's display label, reorder the baselines, or change which
methods start visible in the grid, edit `OURS` / `BASELINES` at the top of
`static/js/data.js` — both viewers read from there.

## The two viewers

### 1. Slider comparison — "Comparison vs VideoMaMa (Ours)"

A draggable divider with a baseline on the left and VideoMaMa++ on the right,
both playing the same clip at the same instant. Step through clips with the
carousel dots below the stage, choose which baseline to compare against (or the
raw input video), and switch between the alpha matte and the greenscreen
composite.

Clips are addressed by position only — the dots carry no labels and neither
viewer prints a clip name, so nothing in the UI identifies the source footage. The folder names are still
visible in the video URLs; rename the folders under `videos/` and rerun
`tools/regenerate.py` if those should be opaque too.

The divider is a real `<input type="range">` laid over the stage at zero opacity,
so pointer drag, touch, tap-to-jump and keyboard all work natively. The front
video is revealed with `clip-path`, which means neither side is ever rescaled —
the two halves stay pixel-aligned at every divider position.

| Action | Control |
|---|---|
| Move the divider | drag it, or tap anywhere on the video |
| Fine control | focus the divider, then <kbd>←</kbd> <kbd>→</kbd> |
| Jump to a clip | click a dot |
| Previous / next clip | the ← → buttons flanking the dots |
| Play / pause | tap the video or the Play button |
| Scrub / restart | the seek bar and ↺ below the stage |

The same component powers the hero teaser (input ↔ our result). Change which
clip it shows with `data-clip` on `<div id="teaserSlider">` in `index.html`.

### 2. Grid comparison — "All methods side by side"

Every enabled method in one row, on a single synchronized timeline — better for
spotting which baseline fails where.

| Action | Control |
|---|---|
| Play / pause all | click any panel, the Play button, or <kbd>Space</kbd> |
| Jump to a clip | click a dot in the sticky bar |
| Previous / next clip | the ← → buttons, or <kbd>←</kbd> <kbd>→</kbd> |
| Restart from 0 | ↺ button or <kbd>R</kbd> |
| Show/hide a method | the method pills |

All players are driven off a single master (the input RGB video) and resynced
whenever any of them drifts more than 0.15 s.

## The hero pair — VideoMaMa vs VideoMaMa++

The section under the title plays the input, VideoMaMa and VideoMaMa++ on the
same clip at the same instant (`static/js/pair.js`).

`tools/temporal_stats.py` is not used by the page; it measures the mean
frame-to-frame alpha change per clip (into `static/js/temporal.js`) if you want
to check which clips show the boundary jumps most clearly.
