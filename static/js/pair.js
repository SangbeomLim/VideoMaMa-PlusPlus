/* ==========================================================================
   VideoMaMa++ — hero pair: VideoMaMa vs VideoMaMa++
   --------------------------------------------------------------------------
   Input, VideoMaMa and VideoMaMa++ on one timeline. Underneath, a track marks
   where VideoMaMa starts a new chunk: it mattes each 6-frame chunk on its own,
   so the matte can jump at those boundaries. Each mark lights up as playback
   crosses it; clicking one replays that boundary.
   Dependency-free.
   ========================================================================== */

(function () {
  "use strict";

  const V = window.VMPP;

  const INPUT = { id: "__rgb__", label: "Input video", badge: "RGB", input: true };
  const LEFT = { id: "VideoMaMa", label: "VideoMaMa", badge: "Chunk-wise baseline" };
  const RIGHT = { id: "VideoMaMa++", label: "VideoMaMa++", badge: "Ours", ours: true };

  // Resync a follower once it drifts further than this from the master.
  const DRIFT = 0.15;

  // Every clip on the page is encoded at 10 fps, one video frame per input
  // frame. VideoMaMa ran with non-overlapping 6-frame chunks (--num_frames 6),
  // so its chunks start at frames 0, 6, 12, ...
  const SRC_FPS = 10;
  const CHUNK = 6;
  // How long a crossed boundary mark stays lit, in ms.
  const FLASH_MS = 450;

  function el(tag, attrs = {}, kids = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k === "html") node.innerHTML = v;
      else node.setAttribute(k, v);
    }
    for (const kid of kids) node.appendChild(kid);
    return node;
  }

  function mkVideo() {
    const v = el("video", { playsinline: "", muted: "", loop: "", preload: "metadata" });
    v.muted = true;
    v.playsInline = true;
    return v;
  }

  /* ---------------------------------------------------------------------- */
  /* Chunk-boundary track                                                   */
  /* ---------------------------------------------------------------------- */

  class SeamTrack {
    /** @param {HTMLElement} track  @param {(frame:number)=>void} onJump */
    constructor(track, onJump) {
      this.track = track;
      this.frames = 0;
      this.marks = [];
      this.layer = el("div", { class: "hp-chunks" });
      this.head = el("div", { class: "hp-head" });
      track.append(this.layer, this.head);
      track.addEventListener("click", (e) => {
        if (!this.frames) return;
        const mark = e.target.closest(".hp-mark");
        if (mark) return onJump(Number(mark.dataset.frame) - 2);
        const r = track.getBoundingClientRect();
        onJump(Math.floor(((e.clientX - r.left) / r.width) * this.frames));
      });
    }

    /** Lay out the chunks of a clip with n frames. */
    setFrames(n) {
      if (n === this.frames) return;
      this.frames = n;
      this.layer.textContent = "";
      this.marks = [];
      const pct = (f) => (f / n) * 100 + "%";
      for (let k = 0, start = 0; start < n; k++, start += CHUNK) {
        const len = Math.min(CHUNK, n - start);
        this.layer.appendChild(el("div", {
          class: "hp-chunk" + (k % 2 ? " alt" : ""),
          style: `left:${pct(start)};width:${pct(len)}`,
        }));
        if (start > 0) {
          const mark = el("button", {
            type: "button",
            class: "hp-mark",
            "data-frame": String(start),
            style: `left:${pct(start)}`,
            title: `Chunk boundary: frame ${start - 1} → ${start}`,
            "aria-label": `Jump to the chunk boundary at frame ${start}`,
          });
          this.layer.appendChild(mark);
          this.marks.push(mark);
        }
      }
    }

    setHead(frac) {
      this.head.style.left = Math.max(0, Math.min(1, frac || 0)) * 100 + "%";
    }

    /** Highlight the mark at this boundary frame. */
    hit(frame) {
      const m = this.marks.find((x) => Number(x.dataset.frame) === frame);
      if (!m) return;
      m.classList.add("hit");
      setTimeout(() => m.classList.remove("hit"), FLASH_MS);
    }
  }

  /* ---------------------------------------------------------------------- */

  function init() {
    const host = document.getElementById("heroPair");
    if (!host) return;

    const dotsHost = document.getElementById("hpDots");
    const prevBtn = document.getElementById("hpPrev");
    const nextBtn = document.getElementById("hpNext");
    const kindWrap = document.getElementById("hpKind");
    const playBtn = document.getElementById("hpPlay");
    const restartBtn = document.getElementById("hpRestart");
    const seek = document.getElementById("hpSeek");
    const trackEl = document.getElementById("hpTrack");

    // This section's own clip order: the clips listed in data-clip (comma
    // separated) come first, in that order; the rest follow in the shared
    // order. Other sections are unaffected.
    const featured = (host.dataset.clip || "")
      .split(",").map((c) => c.trim()).filter((c) => V.CLIPS.includes(c));
    const clips = [...featured, ...V.CLIPS.filter((c) => !featured.includes(c))];
    const state = { idx: 0, kind: "pred_alpha" };

    // --- players -----------------------------------------------------------
    const sides = [INPUT, LEFT, RIGHT].map((m) => {
      const video = mkVideo();
      const tile = el("figure", { class: "hp-tile" + (m.ours ? " is-ours" : "") + (m.input ? " is-input" : "") }, [
        el("figcaption", { class: "hp-cap" }, [
          el("span", { class: "hp-name", text: m.label }),
          el("span", { class: "hp-badge", text: m.badge }),
        ]),
        el("div", { class: "hp-vid" }, [video, el("div", { class: "hp-play" }, [el("div", { class: "hp-disc", html: "&#9654;" })])]),
      ]);
      tile.querySelector(".hp-vid").addEventListener("click", () => toggle());
      host.appendChild(tile);
      return { method: m, video, tile };
    });

    // The input video drives the timeline; the two mattes follow it.
    const master = sides[0].video;
    const track = new SeamTrack(trackEl, (frame) => jumpTo(frame));

    function seekAll(t) {
      for (const s of sides) { try { s.video.currentTime = t; } catch (_) {} }
    }
    // Jump to a frame (a little past its start, so it is the frame shown) and play.
    function jumpTo(frame) {
      const n = track.frames;
      if (!n) return;
      const f = Math.max(0, Math.min(n - 1, frame));
      seekAll((f + 0.05) / SRC_FPS);
      lastFrame = f;
      play();
    }

    // Watch the frame number every animation frame (timeupdate is only ~4 Hz,
    // too coarse for a boundary every 0.6 s) and light the mark on each crossing.
    let lastFrame = -1;
    (function tick() {
      const d = master.duration;
      if (Number.isFinite(d) && d > 0) {
        const f = Math.floor(master.currentTime * SRC_FPS + 1e-3);
        if (f !== lastFrame) {
          if (!master.paused && f === lastFrame + 1 && f % CHUNK === 0 && f < track.frames) track.hit(f);
          lastFrame = f;
        }
        track.setHead(master.currentTime / d);
      }
      requestAnimationFrame(tick);
    })();

    function paint(paused) {
      playBtn.textContent = paused ? "Play" : "Pause";
      for (const s of sides) s.tile.classList.toggle("paused", paused);
    }

    function play() {
      for (const s of sides) s.video.play().catch(() => {});
      paint(false);
    }
    function pause() {
      for (const s of sides) s.video.pause();
      paint(true);
    }
    function toggle() { master.paused ? play() : pause(); }

    // Size the row to this clip's shape (see .hp-stage in style.css).
    master.addEventListener("loadedmetadata", () => {
      if (master.videoWidth && master.videoHeight) {
        host.style.setProperty("--ar", (master.videoWidth / master.videoHeight).toFixed(4));
      }
      if (Number.isFinite(master.duration)) track.setFrames(Math.round(master.duration * SRC_FPS));
    });
    master.addEventListener("play", () => paint(false));
    master.addEventListener("pause", () => paint(true));
    master.addEventListener("timeupdate", () => {
      const d = master.duration;
      for (const s of sides.slice(1)) {
        if (Number.isFinite(s.video.duration) && Math.abs(s.video.currentTime - master.currentTime) > DRIFT) {
          try { s.video.currentTime = master.currentTime; } catch (_) {}
        }
      }
      if (Number.isFinite(d) && d > 0) seek.value = Math.round((master.currentTime / d) * 1000);
    });

    // --- clip loading ------------------------------------------------------
    const clip = () => clips[state.idx];

    function refresh(dir) {
      dots.set(state.idx);
      if (dir !== undefined) V.slideIn(host, dir);
      for (const s of sides) {
        s.video.src = s.method.input
          ? V.inputPath(clip(), "rgb")
          : V.methodPath(clip(), s.method.id, state.kind);
        s.video.load();
      }
      Promise.allSettled(
        sides.map((s) => new Promise((res) => {
          if (s.video.readyState >= 2) return res();
          s.video.addEventListener("loadeddata", res, { once: true });
          s.video.addEventListener("error", res, { once: true });
        }))
      ).then(() => play());
    }

    const dots = V.buildDots(dotsHost, clips.length, (i) => goTo(i));

    function goTo(i, dir) {
      if (i === state.idx) return;
      const d = dir !== undefined ? dir : i > state.idx ? 1 : -1;
      state.idx = (i + clips.length) % clips.length;
      refresh(d);
    }
    function step(d) { goTo((state.idx + d + clips.length) % clips.length, d); }

    prevBtn.addEventListener("click", () => step(-1));
    nextBtn.addEventListener("click", () => step(1));
    dotsHost.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); dotsHost.querySelector(".dot.on")?.focus(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); step(1); dotsHost.querySelector(".dot.on")?.focus(); }
    });

    kindWrap.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-kind]");
      if (!btn) return;
      state.kind = btn.dataset.kind;
      kindWrap.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === btn));
      refresh();
    });

    playBtn.addEventListener("click", () => toggle());
    restartBtn.addEventListener("click", () => {
      seekAll(0);
      lastFrame = 0;
      play();
    });
    seek.addEventListener("input", () => {
      const d = master.duration;
      if (!Number.isFinite(d)) return;
      const t = (parseInt(seek.value, 10) / 1000) * d;
      seekAll(t);
      lastFrame = Math.floor(t * SRC_FPS + 1e-3);
    });

    refresh();
  }

  window.addEventListener("DOMContentLoaded", init);
})();
