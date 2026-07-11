(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const canvas = $("workspaceCanvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const frame = document.querySelector(".canvas-frame");
  const DPR = () => window.devicePixelRatio || 1;
  const cssVar = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();

  const defaultAdjustments = () => ({
    brightness: 0,
    contrast: 0,
    gamma: 1,
    saturation: 1,
    toneMap: false,
    toneMapMin: "#000000",
    toneMapMax: "#ffffff",
    invert: false,
    sharpen: 0,
    denoise: 0,
    backgroundSubtract: 0,
    rotation: 0,
    crop: null,
    flipX: false,
    flipY: false
  });

  const state = {
    image: null,
    adjustments: defaultAdjustments(),
    overlayCrop: { left: 0, top: 0, right: 0, bottom: 0 },
    view: { zoom: 1, panX: 40, panY: 40 },
    viewLocked: true,
    tool: "select",
    annotations: [],
    overlays: [],
    signatures: createDefaultSignatures(),
    results: [],
    selected: null,
    draft: null,
    cropRegion: null,
    dragging: null,
    layerVisibility: {
      processed: true,
      annotations: true,
      overlays: true
    },
    history: [],
    historyIndex: -1,
    isRestoring: false
  };

  const els = {
    imageInput: $("imageInput"),
    overlayImageInput: $("overlayImageInput"),
    projectImportInput: $("projectImportInput"),
    signatureImportInput: $("signatureImportInput"),
    imageMeta: $("imageMeta"),
    cursorReadout: $("cursorReadout"),
    zoomReadout: $("zoomReadout"),
    layerList: $("layerList"),
    resultsList: $("resultsList"),
    signatureSearch: $("signatureSearch"),
    signatureSelect: $("signatureSelect"),
    signatureEditor: $("signatureEditor"),
    annotationLabel: $("annotationLabel"),
    annotationColor: $("annotationColor"),
    cropMeta: $("cropMeta"),
    overlayList: $("overlayList"),
    themeToggleBtn: $("themeToggleBtn"),
    viewLockBtn: $("viewLockBtn"),
    fitViewBtn: $("fitViewBtn"),
    overlayCropLeft: $("overlayCropLeft"),
    overlayCropTop: $("overlayCropTop"),
    overlayCropRight: $("overlayCropRight"),
    overlayCropBottom: $("overlayCropBottom")
  };

  const adjustmentIds = [
    "brightness",
    "contrast",
    "gamma",
    "saturation",
    "sharpen",
    "denoise",
    "backgroundSubtract",
    "toneMap",
    "toneMapMin",
    "toneMapMax",
    "invert"
  ];

  function createDefaultSignatures() {
    return [
      {
        id: id("sig"),
        name: "Example three-lane ladder",
        category: "Reference",
        species: "",
        product: "Demo",
        gene: "",
        diagnosticTarget: "Demonstration pattern",
        notes: "Normalized lane and band positions. Replace with lab-validated signatures.",
        lanes: [
          {
            id: id("lane"),
            label: "L1",
            xPosition: 0.22,
            bands: [
              { id: id("band"), yPosition: 0.18, expectedIntensity: 0.8, tolerance: 0.035, label: "A" },
              { id: id("band"), yPosition: 0.42, expectedIntensity: 1, tolerance: 0.04, label: "B" },
              { id: id("band"), yPosition: 0.71, expectedIntensity: 0.5, tolerance: 0.045, label: "C" }
            ]
          },
          {
            id: id("lane"),
            label: "L2",
            xPosition: 0.5,
            bands: [
              { id: id("band"), yPosition: 0.24, expectedIntensity: 0.65, tolerance: 0.04, label: "D" },
              { id: id("band"), yPosition: 0.56, expectedIntensity: 1, tolerance: 0.04, label: "E" }
            ]
          },
          {
            id: id("lane"),
            label: "L3",
            xPosition: 0.77,
            bands: [
              { id: id("band"), yPosition: 0.32, expectedIntensity: 0.7, tolerance: 0.04, label: "F" },
              { id: id("band"), yPosition: 0.67, expectedIntensity: 0.85, tolerance: 0.045, label: "G" }
            ]
          }
        ],
        metadata: { coordinateSystem: "normalized" }
      }
    ];
  }

  function id(prefix) {
    if (window.crypto && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function activeImageCanvas() {
    return state.image ? state.image.processedCanvas : null;
  }

  function imageSize() {
    const img = activeImageCanvas();
    return img ? { width: img.width, height: img.height } : { width: 1, height: 1 };
  }

  function fileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function loadImageElement(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("The browser could not decode that image."));
      img.src = src;
    });
  }

  async function loadImageFromFile(file) {
    const dataUrl = await fileToDataUrl(file);
    const imageEl = await loadImageElement(dataUrl);
    const originalCanvas = document.createElement("canvas");
    originalCanvas.width = imageEl.naturalWidth;
    originalCanvas.height = imageEl.naturalHeight;
    originalCanvas.getContext("2d").drawImage(imageEl, 0, 0);

    state.image = {
      fileName: file.name,
      fileSize: file.size,
      type: file.type || "unknown",
      width: imageEl.naturalWidth,
      height: imageEl.naturalHeight,
      dataUrl,
      element: imageEl,
      originalCanvas,
      processedCanvas: document.createElement("canvas")
    };
    state.adjustments = defaultAdjustments();
    state.cropRegion = null;
    syncAdjustmentInputs();
    renderProcessedImage();
    fitToScreen();
    pushHistory("load image");
    updateAll();
  }

  function createWorkingImage(original) {
    const copy = document.createElement("canvas");
    copy.width = original.width;
    copy.height = original.height;
    copy.getContext("2d").drawImage(original, 0, 0);
    return copy;
  }

  function resetToOriginal() {
    state.adjustments = defaultAdjustments();
    state.cropRegion = null;
    syncAdjustmentInputs();
    renderProcessedImage();
    fitToScreen();
    pushHistory("reset image");
    updateAll();
  }

  function renderProcessedImage() {
    if (!state.image) return;
    const original = state.image.originalCanvas;
    const a = state.adjustments;
    a.crop = null;
    a.flipX = false;
    a.flipY = false;
    a.rotation = 0;
    const crop = normalizeCrop(a.crop, original.width, original.height);
    const rotate = Number(a.rotation) % 360;
    const rightAngle = rotate === 90 || rotate === 270;
    const out = state.image.processedCanvas;
    out.width = rightAngle ? crop.height : crop.width;
    out.height = rightAngle ? crop.width : crop.height;

    const outCtx = out.getContext("2d", { willReadFrequently: true });
    outCtx.save();
    outCtx.clearRect(0, 0, out.width, out.height);
    outCtx.translate(out.width / 2, out.height / 2);
    outCtx.rotate((rotate * Math.PI) / 180);
    outCtx.scale(a.flipX ? -1 : 1, a.flipY ? -1 : 1);
    outCtx.drawImage(
      original,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      -crop.width / 2,
      -crop.height / 2,
      crop.width,
      crop.height
    );
    outCtx.restore();

    let imageData = outCtx.getImageData(0, 0, out.width, out.height);
    if (a.denoise > 0) imageData = convolve(imageData, blurKernel(a.denoise / 100));
    imageData = applyPixelAdjustments(imageData, a);
    if (a.sharpen > 0) imageData = convolve(imageData, sharpenKernel(a.sharpen / 100));
    outCtx.putImageData(imageData, 0, 0);
  }

  function normalizeCrop(crop, width, height) {
    if (!crop) return { x: 0, y: 0, width, height };
    const x = clamp(Math.round(crop.x || 0), 0, width - 1);
    const y = clamp(Math.round(crop.y || 0), 0, height - 1);
    const w = clamp(Math.round(crop.width || width), 1, width - x);
    const h = clamp(Math.round(crop.height || height), 1, height - y);
    return { x, y, width: w, height: h };
  }

  function applyPixelAdjustments(imageData, a) {
    const data = imageData.data;
    const brightness = Number(a.brightness) || 0;
    const contrast = ((Number(a.contrast) || 0) + 100) / 100;
    const gamma = Math.max(0.05, Number(a.gamma) || 1);
    const saturation = Math.max(0, Number(a.saturation) || 1);
    const bg = Number(a.backgroundSubtract) || 0;
    const gammaInv = 1 / gamma;
    const avg = bg > 0 ? averageLuminance(data) : 0;
    const subtract = avg * (bg / 100) * 0.85;
    const minColor = hexToRgb(a.toneMapMin, { r: 0, g: 0, b: 0 });
    const maxColor = hexToRgb(a.toneMapMax, { r: 255, g: 255, b: 255 });

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      if (subtract) {
        r -= subtract;
        g -= subtract;
        b -= subtract;
      }

      r = ((r - 128) * contrast) + 128 + brightness;
      g = ((g - 128) * contrast) + 128 + brightness;
      b = ((b - 128) * contrast) + 128 + brightness;

      r = 255 * Math.pow(clamp(r, 0, 255) / 255, gammaInv);
      g = 255 * Math.pow(clamp(g, 0, 255) / 255, gammaInv);
      b = 255 * Math.pow(clamp(b, 0, 255) / 255, gammaInv);

      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (a.toneMap) {
        const t = clamp(lum, 0, 255) / 255;
        r = minColor.r + (maxColor.r - minColor.r) * t;
        g = minColor.g + (maxColor.g - minColor.g) * t;
        b = minColor.b + (maxColor.b - minColor.b) * t;
      } else if (saturation !== 1) {
        r = lum + (r - lum) * saturation;
        g = lum + (g - lum) * saturation;
        b = lum + (b - lum) * saturation;
      }

      if (a.invert) {
        r = 255 - r;
        g = 255 - g;
        b = 255 - b;
      }

      data[i] = clamp(r, 0, 255);
      data[i + 1] = clamp(g, 0, 255);
      data[i + 2] = clamp(b, 0, 255);
    }
    return imageData;
  }

  function hexToRgb(value, fallback) {
    const hex = String(value || "").trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }

  function averageLuminance(data) {
    let sum = 0;
    for (let i = 0; i < data.length; i += 16) {
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }
    return sum / (data.length / 16);
  }

  function blurKernel(amount) {
    const a = clamp(amount, 0, 1);
    const edge = a * 0.12;
    const center = 1 - edge * 8;
    return [edge, edge, edge, edge, center, edge, edge, edge, edge];
  }

  function sharpenKernel(amount) {
    const side = -amount;
    const center = 1 + amount * 4;
    return [0, side, 0, side, center, side, 0, side, 0];
  }

  function convolve(imageData, kernel) {
    const { width, height, data } = imageData;
    const copy = new Uint8ClampedArray(data);
    const side = Math.round(Math.sqrt(kernel.length));
    const half = Math.floor(side / 2);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dst = (y * width + x) * 4;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let ky = 0; ky < side; ky += 1) {
          for (let kx = 0; kx < side; kx += 1) {
            const px = clamp(x + kx - half, 0, width - 1);
            const py = clamp(y + ky - half, 0, height - 1);
            const src = (py * width + px) * 4;
            const weight = kernel[ky * side + kx];
            r += copy[src] * weight;
            g += copy[src + 1] * weight;
            b += copy[src + 2] * weight;
          }
        }
        data[dst] = clamp(r, 0, 255);
        data[dst + 1] = clamp(g, 0, 255);
        data[dst + 2] = clamp(b, 0, 255);
      }
    }
    return imageData;
  }

  function resizeWorkspace() {
    const rect = frame.getBoundingClientRect();
    const dpr = DPR();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    if (state.viewLocked) fitToScreen();
    draw();
  }

  function fitToScreen() {
    const img = activeImageCanvas();
    if (!img) return;
    const rect = frame.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return;
    const zoom = Math.min(rect.width / img.width, rect.height / img.height) * 0.92;
    state.view.zoom = clamp(zoom, 0.03, 20);
    state.view.panX = (rect.width - img.width * state.view.zoom) / 2;
    state.view.panY = (rect.height - img.height * state.view.zoom) / 2;
  }

  function fitViewToWindow() {
    fitToScreen();
    draw();
  }

  function actualSize() {
    state.view.zoom = 1;
    state.view.panX = 40;
    state.view.panY = 40;
    draw();
  }

  function updateViewLockControl() {
    if (!els.viewLockBtn) return;
    els.viewLockBtn.textContent = state.viewLocked ? "🔒" : "🔓";
    els.viewLockBtn.title = state.viewLocked ? "Unlock view zoom/pan" : "Lock view zoom/pan";
    els.viewLockBtn.classList.toggle("active", !state.viewLocked);
    els.viewLockBtn.setAttribute("aria-pressed", String(!state.viewLocked));
    canvas.classList.toggle("view-unlocked", !state.viewLocked);
  }

  function toggleViewLock() {
    state.viewLocked = !state.viewLocked;
    if (state.viewLocked) fitToScreen();
    updateViewLockControl();
    draw();
  }

  function screenToImage(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: (sx - state.view.panX) / state.view.zoom,
      y: (sy - state.view.panY) / state.view.zoom,
      sx,
      sy
    };
  }

  function imageToScreen(point) {
    return {
      x: point.x * state.view.zoom + state.view.panX,
      y: point.y * state.view.zoom + state.view.panY
    };
  }

  function draw() {
    const dpr = DPR();
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = cssVar("--canvas") || "#dfe5e9";
    ctx.fillRect(0, 0, width, height);

    const img = activeImageCanvas();
    if (!img) {
      drawEmptyState(width, height);
      return;
    }

    if (state.viewLocked) {
      const imageOffscreen = state.view.zoom <= 0 ||
        state.view.panX > width ||
        state.view.panY > height ||
        state.view.panX + img.width * state.view.zoom < 0 ||
        state.view.panY + img.height * state.view.zoom < 0;
      if (imageOffscreen) fitToScreen();
    }

    ctx.save();
    ctx.translate(state.view.panX, state.view.panY);
    ctx.scale(state.view.zoom, state.view.zoom);
    ctx.imageSmoothingEnabled = false;

    if (state.layerVisibility.processed) {
      ctx.drawImage(img, 0, 0);
    } else {
      ctx.drawImage(state.image.originalCanvas, 0, 0, img.width, img.height);
    }

    if (state.layerVisibility.overlays) drawOverlays(ctx);
    if (state.layerVisibility.annotations) drawAnnotations(ctx);
    if (state.draft) drawAnnotation(ctx, state.draft, true);
    if (state.cropRegion) drawCropRegion(ctx, state.cropRegion);

    ctx.restore();
    drawSelectionOutline();

    els.zoomReadout.textContent = `${Math.round(state.view.zoom * 100)}%`;
  }

  function drawEmptyState(width, height) {
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#cfd8df";
    ctx.lineWidth = 1;
    const boxW = Math.min(420, width - 48);
    const boxH = 140;
    const x = (width - boxW) / 2;
    const y = (height - boxH) / 2;
    ctx.fillRect(x, y, boxW, boxH);
    ctx.strokeRect(x, y, boxW, boxH);
    ctx.fillStyle = "#172026";
    ctx.font = "700 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Upload a gel image to begin", width / 2, y + 56);
    ctx.fillStyle = "#66727c";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText("All processing stays local in this browser.", width / 2, y + 84);
    ctx.restore();
  }

  function drawAnnotations(targetCtx) {
    state.annotations.filter((a) => a.visible).forEach((annotation) => {
      drawAnnotation(targetCtx, annotation, state.selected && state.selected.id === annotation.id);
    });
  }

  function drawCropRegion(targetCtx, region) {
    targetCtx.save();
    targetCtx.strokeStyle = "#256f82";
    targetCtx.fillStyle = "rgba(37, 111, 130, 0.12)";
    targetCtx.lineWidth = 2 / state.view.zoom;
    targetCtx.setLineDash([8 / state.view.zoom, 5 / state.view.zoom]);
    targetCtx.fillRect(region.x, region.y, region.width, region.height);
    targetCtx.strokeRect(region.x, region.y, region.width, region.height);
    targetCtx.restore();
  }

  function drawAnnotation(targetCtx, annotation, selected = false) {
    const color = annotation.color || "#16a34a";
    targetCtx.save();
    targetCtx.strokeStyle = color;
    targetCtx.fillStyle = color;
    targetCtx.lineWidth = selected ? 3 / state.view.zoom : 2 / state.view.zoom;
    targetCtx.setLineDash(selected ? [8 / state.view.zoom, 5 / state.view.zoom] : []);
    const p = annotation.points || [];
    if (annotation.type === "lane" || annotation.type === "band" || annotation.type === "line") {
      if (p.length >= 2) {
        targetCtx.beginPath();
        targetCtx.moveTo(p[0].x, p[0].y);
        targetCtx.lineTo(p[1].x, p[1].y);
        targetCtx.stroke();
      }
    } else if (annotation.type === "rect") {
      const r = rectFromPoints(p[0], p[1]);
      targetCtx.strokeRect(r.x, r.y, r.width, r.height);
      targetCtx.globalAlpha = 0.08;
      targetCtx.fillRect(r.x, r.y, r.width, r.height);
      targetCtx.globalAlpha = 1;
    } else if (annotation.type === "label") {
      const label = annotation.label || "Label";
      targetCtx.font = `${Math.max(12 / state.view.zoom, 11)}px system-ui, sans-serif`;
      targetCtx.lineWidth = 4 / state.view.zoom;
      targetCtx.strokeStyle = "rgba(255,255,255,0.9)";
      targetCtx.strokeText(label, p[0].x, p[0].y);
      targetCtx.fillText(label, p[0].x, p[0].y);
    }
    if (annotation.label && annotation.type !== "label" && p.length) {
      targetCtx.setLineDash([]);
      targetCtx.font = `${Math.max(11 / state.view.zoom, 10)}px system-ui, sans-serif`;
      targetCtx.lineWidth = 4 / state.view.zoom;
      targetCtx.strokeStyle = "rgba(255,255,255,0.9)";
      targetCtx.strokeText(annotation.label, p[0].x + 5 / state.view.zoom, p[0].y - 5 / state.view.zoom);
      targetCtx.fillStyle = color;
      targetCtx.fillText(annotation.label, p[0].x + 5 / state.view.zoom, p[0].y - 5 / state.view.zoom);
    }
    targetCtx.restore();
  }

  function drawOverlays(targetCtx) {
    const overlays = [...state.overlays].sort((a, b) => a.zIndex - b.zIndex);
    overlays.filter((overlay) => overlay.visible).forEach((overlay) => {
      drawOverlay(targetCtx, overlay);
      drawOverlayLabel(targetCtx, overlay);
    });
  }

  function drawOverlay(targetCtx, overlay) {
    targetCtx.save();
    targetCtx.globalAlpha = overlay.opacity;
    targetCtx.translate(overlay.x, overlay.y);
    targetCtx.rotate((overlay.rotation * Math.PI) / 180);
    targetCtx.transform(1, 0, Math.tan((overlay.skewX || 0) * Math.PI / 180), 1, 0, 0);
    targetCtx.scale(overlay.scaleX, overlay.scaleY);

    if (overlay.type === "image" && overlay.imageElement) {
      const crop = overlaySourceCrop(overlay);
      targetCtx.drawImage(
        overlay.imageElement,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        overlay.width,
        overlay.height
      );
    } else if (overlay.type === "signature") {
      drawSignatureShape(targetCtx, overlay.signature, overlay.width, overlay.height);
    }

    targetCtx.restore();
  }

  function normalizedOverlayCrop() {
    const crop = state.overlayCrop || {};
    let left = clamp(Number(crop.left) || 0, 0, 95);
    let top = clamp(Number(crop.top) || 0, 0, 95);
    let right = clamp(Number(crop.right) || 0, 0, 95);
    let bottom = clamp(Number(crop.bottom) || 0, 0, 95);
    if (left + right > 98) {
      const scale = 98 / (left + right);
      left *= scale;
      right *= scale;
    }
    if (top + bottom > 98) {
      const scale = 98 / (top + bottom);
      top *= scale;
      bottom *= scale;
    }
    return { left, top, right, bottom };
  }

  function overlaySourceCrop(overlay) {
    const crop = normalizedOverlayCrop();
    const width = Math.max(1, overlay.width || 1);
    const height = Math.max(1, overlay.height || 1);
    const x = Math.round(width * crop.left / 100);
    const y = Math.round(height * crop.top / 100);
    const right = Math.round(width * crop.right / 100);
    const bottom = Math.round(height * crop.bottom / 100);
    return {
      x,
      y,
      width: Math.max(1, width - x - right),
      height: Math.max(1, height - y - bottom)
    };
  }

  function drawOverlayLabel(targetCtx, overlay) {
    const label = (overlay.name || "").trim();
    if (!label) return;
    const [corner] = overlayImageCorners(overlay);
    const fontSize = Math.max(11 / state.view.zoom, 10);
    const padX = 5 / state.view.zoom;
    const padY = 3 / state.view.zoom;
    targetCtx.save();
    targetCtx.font = `700 ${fontSize}px system-ui, sans-serif`;
    const textW = targetCtx.measureText(label).width;
    const x = corner.x;
    const y = Math.max(fontSize + padY * 2, corner.y - 6 / state.view.zoom);
    targetCtx.fillStyle = "rgba(255,255,255,0.88)";
    targetCtx.fillRect(x, y - fontSize - padY * 2, textW + padX * 2, fontSize + padY * 2);
    targetCtx.strokeStyle = overlay.flagged ? "rgba(184,91,43,0.95)" : "rgba(37,111,130,0.85)";
    targetCtx.lineWidth = 1 / state.view.zoom;
    targetCtx.strokeRect(x, y - fontSize - padY * 2, textW + padX * 2, fontSize + padY * 2);
    targetCtx.fillStyle = overlay.flagged ? "#7c2d12" : "#172026";
    targetCtx.fillText(label, x + padX, y - padY);
    targetCtx.restore();
  }

  function drawSignatureShape(targetCtx, signature, width, height) {
    targetCtx.save();
    targetCtx.strokeStyle = "#b85b2b";
    targetCtx.fillStyle = "#b85b2b";
    targetCtx.lineWidth = 2;
    targetCtx.font = "13px system-ui, sans-serif";
    signature.lanes.forEach((lane) => {
      const x = normalizePosition(lane.xPosition, width);
      targetCtx.beginPath();
      targetCtx.moveTo(x, 0);
      targetCtx.lineTo(x, height);
      targetCtx.stroke();
      targetCtx.fillText(lane.label || "Lane", x + 6, 15);
      lane.bands.forEach((band) => {
        const y = normalizePosition(band.yPosition, height);
        const bandW = Math.max(width * 0.08, 22);
        targetCtx.beginPath();
        targetCtx.moveTo(x - bandW / 2, y);
        targetCtx.lineTo(x + bandW / 2, y);
        targetCtx.stroke();
        if (band.label) targetCtx.fillText(band.label, x + bandW / 2 + 4, y + 4);
      });
    });
    targetCtx.restore();
  }

  function drawSelectionOutline() {
    if (!state.selected || state.selected.kind !== "overlay") return;
    const overlay = state.overlays.find((item) => item.id === state.selected.id);
    if (!overlay) return;
    const dpr = DPR();
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const corners = overlayScreenCorners(overlay);
    ctx.strokeStyle = "#256f82";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    corners.forEach((p, index) => {
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#256f82";
    overlayHandlePoints(overlay).forEach((p) => {
      ctx.beginPath();
      ctx.rect(p.x - 5, p.y - 5, 10, 10);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  function overlayHandlePoints(overlay) {
    return overlayScreenCorners(overlay);
  }

  function overlayScreenCorners(overlay) {
    const points = [
      { x: 0, y: 0 },
      { x: overlay.width, y: 0 },
      { x: overlay.width, y: overlay.height },
      { x: 0, y: overlay.height }
    ];
    const rad = overlay.rotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return points.map((p) => {
      const sx = p.x * overlay.scaleX;
      const sy = p.y * overlay.scaleY;
      const skewedSX = sx + Math.tan((overlay.skewX || 0) * Math.PI / 180) * sy;
      const x = overlay.x + skewedSX * cos - sy * sin;
      const y = overlay.y + skewedSX * sin + sy * cos;
      return imageToScreen({ x, y });
    });
  }

  function rectFromPoints(a, b) {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(a.x - b.x),
      height: Math.abs(a.y - b.y)
    };
  }

  function squareFromPoints(start, end) {
    const size = imageSize();
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dirX = dx < 0 ? -1 : 1;
    const dirY = dy < 0 ? -1 : 1;
    const maxX = dirX > 0 ? size.width - start.x : start.x;
    const maxY = dirY > 0 ? size.height - start.y : start.y;
    const side = Math.max(1, Math.min(Math.max(Math.abs(dx), Math.abs(dy)), maxX, maxY));
    return {
      x: Math.round(dirX > 0 ? start.x : start.x - side),
      y: Math.round(dirY > 0 ? start.y : start.y - side),
      width: Math.round(side),
      height: Math.round(side)
    };
  }

  function normalizePosition(value, extent) {
    return Math.abs(value) <= 1 ? value * extent : value;
  }

  function makeAnnotation(type, start, end) {
    const size = imageSize();
    let points = [start, end];
    if (type === "lane") {
      const x = Math.abs(start.x - end.x) < 4 ? start.x : end.x;
      points = [{ x, y: 0 }, { x, y: size.height }];
    } else if (type === "band") {
      const y = Math.abs(start.y - end.y) < 4 ? start.y : end.y;
      points = [{ x: 0, y }, { x: size.width, y }];
    } else if (type === "label") {
      points = [start];
    }
    const ann = {
      id: id("ann"),
      type,
      points: points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
      label: els.annotationLabel ? els.annotationLabel.value.trim() : "",
      color: els.annotationColor ? els.annotationColor.value : "#16a34a",
      confidence: 1,
      visible: true,
      locked: false
    };
    if (type === "band") ann.laneX = Math.round(start.x);
    return ann;
  }

  function findAnnotationAt(point) {
    const tolerance = 8 / state.view.zoom;
    for (let i = state.annotations.length - 1; i >= 0; i -= 1) {
      const ann = state.annotations[i];
      if (!ann.visible) continue;
      if (ann.type === "rect") {
        const r = rectFromPoints(ann.points[0], ann.points[1]);
        const inside = point.x >= r.x - tolerance && point.x <= r.x + r.width + tolerance &&
          point.y >= r.y - tolerance && point.y <= r.y + r.height + tolerance;
        if (inside) return ann;
      } else if (ann.type === "label") {
        const p = ann.points[0];
        if (Math.hypot(point.x - p.x, point.y - p.y) <= tolerance * 2) return ann;
      } else if (ann.points.length >= 2 && distanceToSegment(point, ann.points[0], ann.points[1]) <= tolerance) {
        return ann;
      }
    }
    return null;
  }

  function distanceToSegment(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  function findOverlayAt(point) {
    for (let i = state.overlays.length - 1; i >= 0; i -= 1) {
      const overlay = state.overlays[i];
      if (!overlay.visible) continue;
      const corners = overlayImageCorners(overlay);
      if (pointInPolygon(point, corners)) return overlay;
    }
    return null;
  }

  function overlayImageCorners(overlay) {
    const points = [
      { x: 0, y: 0 },
      { x: overlay.width, y: 0 },
      { x: overlay.width, y: overlay.height },
      { x: 0, y: overlay.height }
    ];
    const rad = overlay.rotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return points.map((p) => {
      const sx = p.x * overlay.scaleX;
      const sy = p.y * overlay.scaleY;
      const skewedSX = sx + Math.tan((overlay.skewX || 0) * Math.PI / 180) * sy;
      return {
        x: overlay.x + skewedSX * cos - sy * sin,
        y: overlay.y + skewedSX * sin + sy * cos
      };
    });
  }

  function findOverlayHandleAt(point) {
    if (!state.selected || state.selected.kind !== "overlay") return null;
    const overlay = state.overlays.find((item) => item.id === state.selected.id);
    if (!overlay || overlay.locked) return null;
    const handles = overlayHandlePoints(overlay);
    const hitRadius = 9;
    for (let index = handles.length - 1; index >= 0; index -= 1) {
      const handle = handles[index];
      if (Math.abs(point.sx - handle.x) <= hitRadius && Math.abs(point.sy - handle.y) <= hitRadius) {
        return { overlay, handleIndex: index };
      }
    }
    return null;
  }

  function overlayBaseVectors(overlay) {
    const rad = overlay.rotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const skew = Math.tan((overlay.skewX || 0) * Math.PI / 180);
    return {
      xAxis: { x: cos, y: sin },
      yAxis: { x: skew * cos - sin, y: skew * sin + cos }
    };
  }

  function solveBasis(delta, xAxis, yAxis) {
    const det = xAxis.x * yAxis.y - xAxis.y * yAxis.x;
    if (Math.abs(det) < 0.000001) return { x: 0, y: 0 };
    return {
      x: (delta.x * yAxis.y - delta.y * yAxis.x) / det,
      y: (xAxis.x * delta.y - xAxis.y * delta.x) / det
    };
  }

  function overlayWorldPoint(overlay, localPoint) {
    const { xAxis, yAxis } = overlayBaseVectors(overlay);
    return {
      x: overlay.x + xAxis.x * overlay.scaleX * localPoint.x + yAxis.x * overlay.scaleY * localPoint.y,
      y: overlay.y + xAxis.y * overlay.scaleX * localPoint.x + yAxis.y * overlay.scaleY * localPoint.y
    };
  }

  function overlayLocalCorner(overlay, index) {
    return [
      { x: 0, y: 0 },
      { x: overlay.width, y: 0 },
      { x: overlay.width, y: overlay.height },
      { x: 0, y: overlay.height }
    ][index];
  }

  function resizeOverlayFromHandle(overlay, handleIndex, point, oppositeWorld) {
    const oppositeIndex = (handleIndex + 2) % 4;
    const handleLocal = overlayLocalCorner(overlay, handleIndex);
    const oppositeLocal = overlayLocalCorner(overlay, oppositeIndex);
    const { xAxis, yAxis } = overlayBaseVectors(overlay);
    const delta = solveBasis({
      x: point.x - oppositeWorld.x,
      y: point.y - oppositeWorld.y
    }, xAxis, yAxis);
    const spanX = handleLocal.x - oppositeLocal.x;
    const spanY = handleLocal.y - oppositeLocal.y;
    const minScaleX = 12 / Math.max(overlay.width, 1);
    const minScaleY = 12 / Math.max(overlay.height, 1);
    if (spanX) overlay.scaleX = Math.max(minScaleX, delta.x / spanX);
    if (spanY) overlay.scaleY = Math.max(minScaleY, delta.y / spanY);
    overlay.x = Math.round(oppositeWorld.x - xAxis.x * overlay.scaleX * oppositeLocal.x - yAxis.x * overlay.scaleY * oppositeLocal.y);
    overlay.y = Math.round(oppositeWorld.y - xAxis.y * overlay.scaleX * oppositeLocal.x - yAxis.y * overlay.scaleY * oppositeLocal.y);
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;
      const intersect = yi > point.y !== yj > point.y &&
        point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function onPointerDown(event) {
    const point = screenToImage(event.clientX, event.clientY);
    if (event.button === 1 || event.altKey) {
      if (!state.viewLocked) {
        state.dragging = { type: "pan", sx: point.sx, sy: point.sy, panX: state.view.panX, panY: state.view.panY };
        canvas.setPointerCapture(event.pointerId);
      }
      return;
    }

    if (!state.image) return;

    if (state.tool === "select") {
      const handle = findOverlayHandleAt(point);
      if (handle) {
        state.selected = { kind: "overlay", id: handle.overlay.id };
        const oppositeIndex = (handle.handleIndex + 2) % 4;
        state.dragging = {
          type: "overlay-resize",
          id: handle.overlay.id,
          handleIndex: handle.handleIndex,
          oppositeWorld: overlayWorldPoint(handle.overlay, overlayLocalCorner(handle.overlay, oppositeIndex))
        };
      } else {
        const annotation = findAnnotationAt(point);
        if (annotation) {
          state.selected = { kind: "annotation", id: annotation.id };
          if (!annotation.locked) {
            state.dragging = { type: "annotation", id: annotation.id, start: point, original: clone(annotation.points) };
          }
        } else {
          const overlay = findOverlayAt(point);
          if (overlay) {
            state.selected = { kind: "overlay", id: overlay.id };
            if (!overlay.locked) {
              state.dragging = { type: "overlay", id: overlay.id, start: point, x: overlay.x, y: overlay.y };
            }
          } else {
            state.selected = null;
            if (!state.viewLocked) {
              state.dragging = { type: "pan", sx: point.sx, sy: point.sy, panX: state.view.panX, panY: state.view.panY };
            }
          }
        }
      }
      syncSelectedControls();
      updateLayerList();
      updateOverlayList();
      draw();
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    const clamped = clampPoint(point);
    if (state.tool === "label") {
      const label = (els.annotationLabel && els.annotationLabel.value.trim()) || window.prompt("Annotation label", "Label") || "Label";
      if (els.annotationLabel) els.annotationLabel.value = label;
      const ann = makeAnnotation("label", clamped, clamped);
      state.annotations.push(ann);
      state.selected = { kind: "annotation", id: ann.id };
      pushHistory("label annotation");
      updateAll();
      return;
    }

    if (state.tool === "crop") {
      state.cropRegion = squareFromPoints(clamped, clamped);
      state.dragging = { type: "crop", start: clamped };
      updateCropMeta();
      canvas.setPointerCapture(event.pointerId);
      draw();
      return;
    }

    state.draft = makeAnnotation(state.tool, clamped, clamped);
    state.dragging = { type: "draw", start: clamped };
    canvas.setPointerCapture(event.pointerId);
    draw();
  }

  function onPointerMove(event) {
    const point = screenToImage(event.clientX, event.clientY);
    els.cursorReadout.textContent = `x ${Math.round(point.x)}, y ${Math.round(point.y)}`;

    if (!state.dragging) return;

    if (state.dragging.type === "pan") {
      state.view.panX = state.dragging.panX + (point.sx - state.dragging.sx);
      state.view.panY = state.dragging.panY + (point.sy - state.dragging.sy);
    } else if (state.dragging.type === "draw" && state.draft) {
      const end = clampPoint(point);
      state.draft = makeAnnotation(state.draft.type, state.dragging.start, end);
    } else if (state.dragging.type === "crop") {
      state.cropRegion = squareFromPoints(state.dragging.start, clampPoint(point));
      updateCropMeta();
    } else if (state.dragging.type === "annotation") {
      const ann = state.annotations.find((item) => item.id === state.dragging.id);
      if (ann) {
        const dx = point.x - state.dragging.start.x;
        const dy = point.y - state.dragging.start.y;
        ann.points = state.dragging.original.map((p) => clampPoint({ x: p.x + dx, y: p.y + dy }));
      }
    } else if (state.dragging.type === "overlay") {
      const overlay = state.overlays.find((item) => item.id === state.dragging.id);
      if (overlay) {
        overlay.x = Math.round(state.dragging.x + point.x - state.dragging.start.x);
        overlay.y = Math.round(state.dragging.y + point.y - state.dragging.start.y);
        syncSelectedControls();
      }
    } else if (state.dragging.type === "overlay-resize") {
      const overlay = state.overlays.find((item) => item.id === state.dragging.id);
      if (overlay) {
        resizeOverlayFromHandle(overlay, state.dragging.handleIndex, point, state.dragging.oppositeWorld);
        syncSelectedControls();
      }
    }

    draw();
  }

  function onPointerUp(event) {
    if (!state.dragging) return;
    if (state.dragging.type === "draw" && state.draft) {
      state.annotations.push(state.draft);
      state.selected = { kind: "annotation", id: state.draft.id };
      state.draft = null;
      pushHistory("draw annotation");
      updateAll();
    } else if (state.dragging.type === "crop") {
      updateCropMeta();
      draw();
    } else if (state.dragging.type === "annotation" || state.dragging.type === "overlay" || state.dragging.type === "overlay-resize") {
      pushHistory("move object");
      updateAll();
    } else {
      draw();
    }
    state.dragging = null;
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch (_) {
      // Pointer capture can already be released by the browser.
    }
  }

  function onWheel(event) {
    event.preventDefault();
    if (state.viewLocked || !state.image) return;
    const point = screenToImage(event.clientX, event.clientY);
    const factor = event.deltaY < 0 ? 1.12 : 0.89;
    const nextZoom = clamp(state.view.zoom * factor, 0.03, 30);
    state.view.panX = point.sx - point.x * nextZoom;
    state.view.panY = point.sy - point.y * nextZoom;
    state.view.zoom = nextZoom;
    draw();
  }

  function clampPoint(point) {
    const size = imageSize();
    return {
      x: clamp(Math.round(point.x), 0, size.width),
      y: clamp(Math.round(point.y), 0, size.height)
    };
  }

  function selectedObject() {
    if (!state.selected) return null;
    if (state.selected.kind === "annotation") return state.annotations.find((item) => item.id === state.selected.id) || null;
    if (state.selected.kind === "overlay") return state.overlays.find((item) => item.id === state.selected.id) || null;
    return null;
  }

  function labelFromFileName(fileName) {
    return String(fileName || "Overlay").replace(/\.[^.]+$/, "");
  }

  function overlayVisualTransform(overlay) {
    return {
      x: overlay.x,
      y: overlay.y,
      displayWidth: overlay.width * overlay.scaleX,
      displayHeight: overlay.height * overlay.scaleY,
      rotation: overlay.rotation || 0,
      skewX: overlay.skewX || 0,
      skewY: overlay.skewY || 0,
      opacity: overlay.opacity
    };
  }

  function applyOverlayVisualTransform(overlay, transform) {
    if (!overlay || !transform) return;
    overlay.x = transform.x;
    overlay.y = transform.y;
    overlay.scaleX = transform.displayWidth / Math.max(overlay.width, 1);
    overlay.scaleY = transform.displayHeight / Math.max(overlay.height, 1);
    overlay.rotation = transform.rotation || 0;
    overlay.skewX = transform.skewX || 0;
    overlay.skewY = transform.skewY || 0;
    overlay.opacity = Number.isFinite(transform.opacity) ? transform.opacity : overlay.opacity;
  }

  function normalizeOverlayFootprint() {
    const source = activeOverlay();
    if (!source) return;
    const transform = overlayVisualTransform(source);
    state.overlays.forEach((overlay) => applyOverlayVisualTransform(overlay, transform));
  }

  function activeOverlay() {
    if (state.selected && state.selected.kind === "overlay") {
      const selected = state.overlays.find((overlay) => overlay.id === state.selected.id);
      if (selected) return selected;
    }
    return state.overlays.find((overlay) => overlay.visible) || state.overlays[0] || null;
  }

  function ensureSingleActiveOverlay() {
    const overlay = activeOverlay();
    if (!overlay) return;
    state.overlays.forEach((item) => {
      item.visible = item.id === overlay.id;
    });
    state.selected = { kind: "overlay", id: overlay.id };
  }

  function activateOverlay(overlayId, options = {}) {
    const target = state.overlays.find((overlay) => overlay.id === overlayId);
    if (!target) return;
    const source = activeOverlay();
    if (options.preserveTransform !== false && source && source.id !== target.id) {
      const transform = overlayVisualTransform(source);
      state.overlays.forEach((overlay) => applyOverlayVisualTransform(overlay, transform));
    }
    state.overlays.forEach((overlay) => {
      overlay.visible = overlay.id === target.id;
    });
    state.selected = { kind: "overlay", id: target.id };
    if (options.history) pushHistory("switch overlay");
    syncSelectedControls();
    updateOverlayList();
    draw();
  }

  async function addOverlayImage(file, options = {}) {
    const dataUrl = await fileToDataUrl(file);
    const img = await loadImageElement(dataUrl);
    const size = imageSize();
    const scale = Math.min(size.width / img.naturalWidth, size.height / img.naturalHeight, 1) * 0.6;
    const overlay = {
      id: id("ovr"),
      type: "image",
      source: "upload",
      name: options.name || labelFromFileName(file.name),
      visible: false,
      locked: false,
      flagged: false,
      opacity: 0.8,
      x: Math.round(size.width * 0.2),
      y: Math.round(size.height * 0.2),
      scaleX: scale,
      scaleY: scale,
      rotation: 0,
      skewX: 0,
      skewY: 0,
      zIndex: nextZ(),
      width: img.naturalWidth,
      height: img.naturalHeight,
      dataUrl,
      imageElement: img,
      data: {}
    };
    state.overlays.push(overlay);
    if (options.visualTransform) applyOverlayVisualTransform(overlay, options.visualTransform);
    if (options.history !== false) {
      activateOverlay(overlay.id, { preserveTransform: false });
      pushHistory("add overlay image");
      updateAll();
    }
    return overlay;
  }

  async function addOverlayImages(files) {
    const list = [...files];
    if (!list.length) return;
    let transform = activeOverlay()
      ? overlayVisualTransform(activeOverlay())
      : null;
    let first = null;
    for (const file of list) {
      const overlay = await addOverlayImage(file, { history: false, visualTransform: transform });
      if (!first) first = overlay;
      if (!transform) transform = overlayVisualTransform(overlay);
    }
    if (first) activateOverlay(first.id, { preserveTransform: false });
    pushHistory(list.length === 1 ? "add overlay image" : "add overlay images");
    updateAll();
  }

  function addOverlayFromSignature(signature) {
    if (!signature || !state.image) return;
    const size = imageSize();
    const overlay = {
      id: id("ovr"),
      type: "signature",
      source: "signature-library",
      name: signature.name,
      visible: true,
      locked: false,
      opacity: 0.8,
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      skewX: 0,
      skewY: 0,
      zIndex: nextZ(),
      width: size.width,
      height: size.height,
      signature: clone(signature),
      data: { signatureId: signature.id }
    };
    state.overlays.push(overlay);
    state.selected = { kind: "overlay", id: overlay.id };
    pushHistory("add signature overlay");
    updateAll();
  }

  function nextZ() {
    const max = state.overlays.reduce((acc, item) => Math.max(acc, item.zIndex), 0);
    return max + 1;
  }

  function updateLayerList() {
    if (!els.layerList) return;
    const items = [];
    state.overlays
      .slice()
      .sort((a, b) => b.zIndex - a.zIndex)
      .forEach((overlay) => items.push({
        id: overlay.id,
        kind: "overlay",
        title: overlay.name,
        meta: `${overlay.type} · ${overlay.visible ? "visible" : "hidden"} · z ${overlay.zIndex}`
      }));
    state.annotations
      .slice()
      .reverse()
      .forEach((ann) => items.push({
        id: ann.id,
        kind: "annotation",
        title: ann.label || ann.type,
        meta: `${ann.type} · ${ann.visible ? "visible" : "hidden"}${ann.locked ? " · locked" : ""}`
      }));

    els.layerList.innerHTML = "";
    if (!items.length) {
      els.layerList.innerHTML = `<div class="meta-list">No overlay or annotation layers yet.</div>`;
      return;
    }

    items.forEach((item) => {
      const node = document.createElement("div");
      node.className = `layer-item ${state.selected && state.selected.id === item.id ? "selected" : ""}`;
      node.tabIndex = 0;
      node.innerHTML = `<strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.meta)}</span>`;
      node.addEventListener("click", () => {
        state.selected = { kind: item.kind, id: item.id };
        syncSelectedControls();
        updateLayerList();
        draw();
      });
      els.layerList.appendChild(node);
    });
  }

  function updateOverlayList() {
    if (!els.overlayList) return;
    els.overlayList.innerHTML = "";
    const overlays = state.overlays.slice().sort((a, b) => b.zIndex - a.zIndex);
    if (!overlays.length) {
      els.overlayList.innerHTML = `<div class="meta-list">No overlays imported.</div>`;
      return;
    }

    overlays.forEach((overlay) => {
      const item = document.createElement("div");
      item.className = `overlay-item ${state.selected && state.selected.kind === "overlay" && state.selected.id === overlay.id ? "selected" : ""} ${overlay.flagged ? "flagged" : ""}`;

      const visible = document.createElement("input");
      visible.type = "radio";
      visible.name = "activeOverlay";
      visible.checked = overlay.visible;
      visible.title = "Show this overlay";
      visible.addEventListener("change", () => {
        if (visible.checked) activateOverlay(overlay.id, { history: true });
      });

      const label = document.createElement("input");
      label.type = "text";
      label.value = overlay.name || "";
      label.placeholder = "Overlay label";
      label.addEventListener("input", () => {
        overlay.name = label.value.trim();
        draw();
      });
      label.addEventListener("change", () => {
        overlay.name = label.value.trim() || "Overlay";
        pushHistory("rename overlay");
        updateAll();
      });

      const flag = document.createElement("button");
      flag.type = "button";
      flag.className = "overlay-flag";
      flag.textContent = overlay.flagged ? "Flagged" : "Flag";
      flag.title = "Mark for review";
      flag.addEventListener("click", () => {
        overlay.flagged = !overlay.flagged;
        pushHistory("flag overlay");
        updateAll();
      });

      const trash = document.createElement("button");
      trash.type = "button";
      trash.className = "overlay-trash";
      trash.textContent = "Trash";
      trash.title = "Delete overlay";
      trash.addEventListener("click", () => {
        removeOverlay(overlay.id);
      });

      item.append(visible, label, flag, trash);
      els.overlayList.appendChild(item);
    });
  }

  function updateSignatureList() {
    if (!els.signatureSearch || !els.signatureSelect) return;
    const query = els.signatureSearch.value.trim().toLowerCase();
    const selected = els.signatureSelect.value || (state.signatures[0] && state.signatures[0].id);
    els.signatureSelect.innerHTML = "";
    state.signatures
      .filter((sig) => !query || JSON.stringify(sig).toLowerCase().includes(query))
      .forEach((sig) => {
        const option = document.createElement("option");
        option.value = sig.id;
        option.textContent = sig.name;
        els.signatureSelect.appendChild(option);
      });
    if ([...els.signatureSelect.options].some((opt) => opt.value === selected)) {
      els.signatureSelect.value = selected;
    } else if (els.signatureSelect.options.length) {
      els.signatureSelect.selectedIndex = 0;
    }
    updateSignatureEditor();
  }

  function selectedSignature() {
    if (!els.signatureSelect) return null;
    return state.signatures.find((sig) => sig.id === els.signatureSelect.value) || null;
  }

  function updateSignatureEditor() {
    if (!els.signatureEditor) return;
    const sig = selectedSignature();
    els.signatureEditor.value = sig ? JSON.stringify(sig, null, 2) : "";
  }

  function saveSignatureFromEditor() {
    if (!els.signatureEditor) return;
    let parsed;
    try {
      parsed = JSON.parse(els.signatureEditor.value);
      validateSignature(parsed);
    } catch (error) {
      alert(`Signature JSON is invalid: ${error.message}`);
      return;
    }
    const existing = state.signatures.findIndex((sig) => sig.id === parsed.id);
    if (existing >= 0) state.signatures[existing] = parsed;
    else state.signatures.push(parsed);
    pushHistory("save signature");
    updateSignatureList();
  }

  function validateSignature(signature) {
    if (!signature || typeof signature !== "object") throw new Error("expected an object");
    if (!signature.id) signature.id = id("sig");
    if (!signature.name) throw new Error("missing name");
    if (!Array.isArray(signature.lanes)) throw new Error("missing lanes array");
    signature.lanes.forEach((lane) => {
      if (!lane.id) lane.id = id("lane");
      if (!Array.isArray(lane.bands)) lane.bands = [];
      lane.bands.forEach((band) => {
        if (!band.id) band.id = id("band");
      });
    });
  }

  function makeSignatureFromAnnotations() {
    if (!state.image) {
      alert("Load an image before generating a signature from annotations.");
      return;
    }
    const size = imageSize();
    const lanes = state.annotations
      .filter((ann) => ann.type === "lane" && ann.visible)
      .map((ann, index) => ({
        id: id("lane"),
        label: ann.label || `Lane ${index + 1}`,
        xPosition: clamp(ann.points[0].x / size.width, 0, 1),
        bands: []
      }))
      .sort((a, b) => a.xPosition - b.xPosition);

    if (!lanes.length) {
      lanes.push({ id: id("lane"), label: "Lane 1", xPosition: 0.5, bands: [] });
    }

    const bandAnnotations = state.annotations.filter((ann) => ann.type === "band" && ann.visible);
    bandAnnotations.forEach((ann, index) => {
      const y = clamp(ann.points[0].y / size.height, 0, 1);
      const nearestLane = nearestLaneForBand(ann, lanes, size);
      nearestLane.bands.push({
        id: id("band"),
        yPosition: y,
        expectedIntensity: 1,
        tolerance: 0.04,
        label: ann.label || `Band ${index + 1}`
      });
    });

    lanes.forEach((lane) => lane.bands.sort((a, b) => a.yPosition - b.yPosition));
    const name = window.prompt("Signature name", `Observed ${new Date().toISOString().slice(0, 10)}`) || "Observed signature";
    const signature = {
      id: id("sig"),
      name,
      category: "Observed",
      notes: "Generated from manual SAGE annotations.",
      lanes,
      metadata: { coordinateSystem: "normalized", generatedBy: "SAGE annotation tools" }
    };
    state.signatures.push(signature);
    pushHistory("generate signature");
    updateSignatureList();
    if (els.signatureSelect) els.signatureSelect.value = signature.id;
    updateSignatureEditor();
    addOverlayFromSignature(signature);
  }

  function nearestLaneForBand(ann, lanes, size) {
    if (!lanes.length) return { bands: [] };
    const rawX = ann.laneX != null ? ann.laneX : ann.points[0].x;
    const normX = size && size.width ? rawX / size.width : rawX;
    return lanes.reduce((best, lane) =>
      Math.abs(lane.xPosition - normX) < Math.abs(best.xPosition - normX) ? lane : best
    , lanes[0]);
  }

  function compareSignatures() {
    if (!state.image) {
      alert("Load an image and annotate lanes/bands before comparing.");
      return;
    }
    const observed = observedSignatureFromAnnotations();
    const results = state.signatures.map((signature) => scoreSignature(observed, signature));
    results.sort((a, b) => b.score - a.score);
    state.results = results;
    updateResults();
  }

  function observedSignatureFromAnnotations() {
    const size = imageSize();
    const laneAnnotations = state.annotations
      .filter((ann) => ann.type === "lane" && ann.visible)
      .sort((a, b) => a.points[0].x - b.points[0].x);
    const lanes = laneAnnotations.length
      ? laneAnnotations.map((ann, index) => ({
          id: ann.id,
          label: ann.label || `Lane ${index + 1}`,
          xPosition: ann.points[0].x / size.width,
          bands: []
        }))
      : [{ id: "observed-lane", label: "Observed", xPosition: 0.5, bands: [] }];

    state.annotations.filter((ann) => ann.type === "band" && ann.visible).forEach((ann, index) => {
      const lane = nearestLaneForBand(ann, lanes, size);
      lane.bands.push({
        id: ann.id,
        yPosition: ann.points[0].y / size.height,
        expectedIntensity: ann.confidence || 1,
        tolerance: 0.04,
        label: ann.label || `Observed ${index + 1}`
      });
    });
    return { id: "observed", name: "Observed annotations", lanes };
  }

  function scoreSignature(observed, expected) {
    let matchedBands = 0;
    let missingBands = 0;
    const matchedObserved = new Set();
    const details = [];

    expected.lanes.forEach((expectedLane) => {
      const observedLane = nearestLane(expectedLane, observed.lanes);
      expectedLane.bands.forEach((expectedBand) => {
        const tol = expectedBand.tolerance || 0.04;
        let best = null;
        let bestDist = Infinity;
        observedLane.bands.forEach((observedBand) => {
          const key = `${observedLane.id}:${observedBand.id}`;
          if (matchedObserved.has(key)) return;
          const dist = Math.abs(observedBand.yPosition - expectedBand.yPosition);
          if (dist < bestDist) {
            bestDist = dist;
            best = { band: observedBand, key };
          }
        });
        if (best && bestDist <= tol) {
          matchedBands += 1;
          matchedObserved.add(best.key);
          details.push({
            expected: expectedBand.label || expectedBand.id,
            lane: expectedLane.label,
            status: "matched",
            delta: Number(bestDist.toFixed(4))
          });
        } else {
          missingBands += 1;
          details.push({
            expected: expectedBand.label || expectedBand.id,
            lane: expectedLane.label,
            status: "missing",
            delta: null
          });
        }
      });
    });

    const observedBandCount = observed.lanes.reduce((sum, lane) => sum + lane.bands.length, 0);
    const extraBands = Math.max(0, observedBandCount - matchedObserved.size);
    const denom = matchedBands + missingBands + extraBands * 0.35;
    const presence = denom === 0 ? 0 : matchedBands / denom;
    const vecObs = signatureVector(observed);
    const vecExp = signatureVector(expected);
    const cosine = cosineSimilarity(vecObs, vecExp);
    const xcorr = crossCorrelation(vecObs, vecExp);
    const score = Math.round((presence * 0.6 + cosine * 0.2 + xcorr * 0.2) * 1000) / 1000;
    const confidence = Math.round(Math.max(0, Math.min(1, score - extraBands * 0.015)) * 1000) / 1000;

    return {
      signatureId: expected.id,
      signatureName: expected.name,
      score,
      confidence,
      matchedBands,
      missingBands,
      extraBands,
      details
    };
  }

  function nearestLane(lane, lanes) {
    if (!lanes.length) return { bands: [] };
    return lanes.reduce((best, item) =>
      Math.abs(item.xPosition - lane.xPosition) < Math.abs(best.xPosition - lane.xPosition) ? item : best
    , lanes[0]);
  }

  function signatureVector(signature, bins = 96) {
    const values = new Array(bins).fill(0);
    signature.lanes.forEach((lane, laneIndex) => {
      lane.bands.forEach((band) => {
        const index = clamp(Math.round(band.yPosition * (bins - 1)), 0, bins - 1);
        const laneWeight = 1 + laneIndex * 0.05;
        values[index] += (band.expectedIntensity || 1) * laneWeight;
      });
    });
    return values;
  }

  function cosineSimilarity(a, b) {
    const length = Math.max(a.length, b.length);
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < length; i += 1) {
      const av = a[i] || 0;
      const bv = b[i] || 0;
      dot += av * bv;
      magA += av * av;
      magB += bv * bv;
    }
    if (!magA || !magB) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  function crossCorrelation(a, b) {
    const n = Math.max(a.length, b.length);
    const maxShift = Math.floor(n * 0.1);
    let best = -Infinity;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < n; i += 1) {
      magA += (a[i] || 0) * (a[i] || 0);
      magB += (b[i] || 0) * (b[i] || 0);
    }
    const norm = Math.sqrt(magA) * Math.sqrt(magB);
    if (!norm) return 0;
    for (let shift = -maxShift; shift <= maxShift; shift += 1) {
      let dot = 0;
      for (let i = 0; i < n; i += 1) {
        const j = i + shift;
        if (j >= 0 && j < n) dot += (a[i] || 0) * (b[j] || 0);
      }
      if (dot > best) best = dot;
    }
    return clamp(best / norm, 0, 1);
  }

  function updateResults() {
    if (!els.resultsList) return;
    els.resultsList.innerHTML = "";
    if (!state.results.length) {
      els.resultsList.innerHTML = `<div class="meta-list">No comparisons run yet.</div>`;
      return;
    }
    state.results.forEach((result) => {
      const node = document.createElement("div");
      node.className = "result-item";
      node.innerHTML = `
        <strong>${escapeHtml(result.signatureName)} · ${(result.score * 100).toFixed(1)}%</strong>
        <span>${result.matchedBands} matched · ${result.missingBands} missing · ${result.extraBands} extra · confidence ${(result.confidence * 100).toFixed(1)}%</span>
      `;
      els.resultsList.appendChild(node);
    });
  }

  function renderCompositionCanvas(options = {}) {
    const img = activeImageCanvas();
    if (!img) return null;
    const output = document.createElement("canvas");
    output.width = img.width;
    output.height = img.height;
    const outCtx = output.getContext("2d");
    if (options.background !== false) outCtx.drawImage(img, 0, 0);
    if (options.overlays !== false) drawOverlaysForExport(outCtx);
    if (options.annotations !== false) drawAnnotationsForExport(outCtx);
    return output;
  }

  function drawOverlaysForExport(outCtx) {
    const prevZoom = state.view.zoom;
    state.view.zoom = 1;
    try {
      state.overlays
        .slice()
        .sort((a, b) => a.zIndex - b.zIndex)
        .filter((overlay) => overlay.visible)
        .forEach((overlay) => {
          drawOverlay(outCtx, overlay);
          drawOverlayLabel(outCtx, overlay);
        });
    } finally {
      state.view.zoom = prevZoom;
    }
  }

  function drawAnnotationsForExport(outCtx) {
    const prevZoom = state.view.zoom;
    state.view.zoom = 1;
    try {
      state.annotations
        .filter((ann) => ann.visible)
        .forEach((ann) => drawAnnotation(outCtx, ann, false));
    } finally {
      state.view.zoom = prevZoom;
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function downloadJson(data, filename) {
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), filename);
  }

  function exportPng() {
    const composition = renderCompositionCanvas();
    if (!composition) return;
    composition.toBlob((blob) => {
      if (blob) downloadBlob(blob, `sage-composition-${timestamp()}.png`);
    }, "image/png");
  }

  function exportProject() {
    const includeRaw = state.image && window.confirm("Include the raw uploaded image in the project JSON? This makes the file larger but allows reopening the project with the image.");
    const project = captureProject(includeRaw);
    downloadJson(project, `sage-project-${timestamp()}.json`);
  }

  function captureProject(includeRawImage = false) {
    return {
      app: "SAGE",
      version: 1,
      exportedAt: new Date().toISOString(),
      image: state.image ? {
        fileName: state.image.fileName,
        fileSize: state.image.fileSize,
        type: state.image.type,
        width: state.image.width,
        height: state.image.height,
        rawImageIncluded: Boolean(includeRawImage),
        dataUrl: includeRawImage ? state.image.dataUrl : undefined
      } : null,
      adjustments: clone(state.adjustments),
      overlayCrop: clone(state.overlayCrop),
      annotations: clone(state.annotations),
      overlays: state.overlays.map(serializeOverlay),
      signatures: clone(state.signatures),
      results: clone(state.results)
    };
  }

  function serializeOverlay(overlay) {
    const copy = clone(overlay);
    delete copy.imageElement;
    return copy;
  }

  async function importProject(file) {
    const text = await file.text();
    const project = JSON.parse(text);
    if (!project || project.app !== "SAGE") throw new Error("Not a SAGE project JSON file.");
    if (project.image && project.image.dataUrl) {
      const img = await loadImageElement(project.image.dataUrl);
      const originalCanvas = document.createElement("canvas");
      originalCanvas.width = img.naturalWidth;
      originalCanvas.height = img.naturalHeight;
      originalCanvas.getContext("2d").drawImage(img, 0, 0);
      state.image = {
        fileName: project.image.fileName || "Imported image",
        fileSize: project.image.fileSize || 0,
        type: project.image.type || "image",
        width: img.naturalWidth,
        height: img.naturalHeight,
        dataUrl: project.image.dataUrl,
        element: img,
        originalCanvas,
        processedCanvas: document.createElement("canvas")
      };
    } else if (project.image) {
      alert("Project imported without raw image data. Upload the matching image to continue visual analysis.");
    }
    const importedAdjustments = project.adjustments || {};
    state.adjustments = { ...defaultAdjustments(), ...importedAdjustments };
    if (importedAdjustments.grayscale && importedAdjustments.toneMap == null) {
      state.adjustments.toneMap = true;
    }
    state.overlayCrop = { left: 0, top: 0, right: 0, bottom: 0, ...(project.overlayCrop || {}) };
    state.annotations = (project.annotations || []).map((ann) => ({ visible: true, locked: false, ...ann }));
    state.signatures = project.signatures || createDefaultSignatures();
    state.results = project.results || [];
    state.overlays = await hydrateOverlays(project.overlays || []);
    ensureSingleActiveOverlay();
    state.cropRegion = null;
    state.viewLocked = true;
    if (state.image) renderProcessedImage();
    syncAdjustmentInputs();
    updateViewLockControl();
    fitToScreen();
    pushHistory("import project");
    updateAll();
  }

  async function importOverlaySet(file) {
    if (!state.image) {
      alert("Load a base image before importing overlays.");
      return;
    }
    const text = await file.text();
    const overlaySet = JSON.parse(text);
    if (!overlaySet || overlaySet.app !== "SAGE" || overlaySet.type !== "overlay-set" || !Array.isArray(overlaySet.overlays)) {
      throw new Error("Expected a SAGE overlay-set JSON file.");
    }
    const currentTransform = activeOverlay() ? overlayVisualTransform(activeOverlay()) : null;
    const imported = await hydrateOverlays(overlaySet.overlays);
    const baseZ = nextZ();
    imported.forEach((overlay, index) => {
      overlay.id = id("ovr");
      overlay.name = overlay.name || `Overlay ${state.overlays.length + index + 1}`;
      overlay.visible = false;
      overlay.locked = Boolean(overlay.locked);
      overlay.flagged = Boolean(overlay.flagged);
      overlay.opacity = Number.isFinite(overlay.opacity) ? overlay.opacity : 0.8;
      overlay.x = Number.isFinite(overlay.x) ? overlay.x : 0;
      overlay.y = Number.isFinite(overlay.y) ? overlay.y : 0;
      overlay.scaleX = Number.isFinite(overlay.scaleX) ? overlay.scaleX : 1;
      overlay.scaleY = Number.isFinite(overlay.scaleY) ? overlay.scaleY : 1;
      overlay.rotation = Number.isFinite(overlay.rotation) ? overlay.rotation : 0;
      overlay.skewX = Number.isFinite(overlay.skewX) ? overlay.skewX : 0;
      overlay.skewY = Number.isFinite(overlay.skewY) ? overlay.skewY : 0;
      overlay.zIndex = baseZ + index;
      state.overlays.push(overlay);
    });
    if (imported.length) {
      if (currentTransform) applyOverlayVisualTransform(imported[0], currentTransform);
      activateOverlay(imported[0].id, { preserveTransform: false });
      pushHistory("import overlay set");
      updateAll();
    }
  }

  async function hydrateOverlays(overlays) {
    const hydrated = [];
    for (const overlay of overlays) {
      const copy = clone(overlay);
      copy.flagged = Boolean(copy.flagged);
      if (copy.type === "image" && copy.dataUrl) {
        try {
          copy.imageElement = await loadImageElement(copy.dataUrl);
        } catch (_) {
          copy.visible = false;
        }
      }
      hydrated.push(copy);
    }
    return hydrated;
  }

  function exportCsv() {
    const headers = ["signatureId", "signatureName", "score", "confidence", "matchedBands", "missingBands", "extraBands"];
    const rows = state.results.map((result) => headers.map((key) => csvCell(result[key])).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv" }), `sage-results-${timestamp()}.csv`);
  }

  function csvCell(value) {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function timestamp() {
    return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  }

  function pushHistory(label) {
    const snapshot = {
      label,
      adjustments: clone(state.adjustments),
      overlayCrop: clone(state.overlayCrop),
      annotations: clone(state.annotations),
      overlays: state.overlays.map(serializeOverlay),
      signatures: clone(state.signatures),
      results: clone(state.results),
      selected: clone(state.selected)
    };
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(snapshot);
    if (state.history.length > 80) state.history.shift();
    state.historyIndex = state.history.length - 1;
    updateUndoRedo();
  }

  async function restoreHistory(index) {
    if (state.isRestoring) return;
    const snapshot = state.history[index];
    if (!snapshot) return;
    state.isRestoring = true;
    try {
      state.adjustments = clone(snapshot.adjustments);
      state.overlayCrop = { left: 0, top: 0, right: 0, bottom: 0, ...(snapshot.overlayCrop || {}) };
      state.annotations = clone(snapshot.annotations);
      state.overlays = await hydrateOverlays(snapshot.overlays);
      state.signatures = clone(snapshot.signatures);
      state.results = clone(snapshot.results);
      state.selected = clone(snapshot.selected);
      ensureSingleActiveOverlay();
      state.cropRegion = null;
      if (state.image) renderProcessedImage();
      syncAdjustmentInputs();
      updateAll();
      updateUndoRedo();
    } finally {
      state.isRestoring = false;
    }
  }

  function undo() {
    if (state.historyIndex <= 0) return;
    state.historyIndex -= 1;
    restoreHistory(state.historyIndex);
  }

  function redo() {
    if (state.historyIndex >= state.history.length - 1) return;
    state.historyIndex += 1;
    restoreHistory(state.historyIndex);
  }

  function updateUndoRedo() {
    $("undoBtn").disabled = state.historyIndex <= 0;
    $("redoBtn").disabled = state.historyIndex >= state.history.length - 1;
  }

  function syncAdjustmentInputs() {
    const a = state.adjustments;
    $("brightness").value = a.brightness;
    $("contrast").value = a.contrast;
    $("gamma").value = Math.round(a.gamma * 100);
    $("saturation").value = Math.round(a.saturation * 100);
    $("sharpen").value = Math.round(a.sharpen);
    $("denoise").value = Math.round(a.denoise);
    $("backgroundSubtract").value = Math.round(a.backgroundSubtract);
    $("toneMap").checked = Boolean(a.toneMap);
    $("toneMapMin").value = a.toneMapMin || "#000000";
    $("toneMapMax").value = a.toneMapMax || "#ffffff";
    $("invert").checked = a.invert;
    updateCropMeta();
  }

  function readAdjustmentsFromInputs() {
    state.adjustments.brightness = Number($("brightness").value);
    state.adjustments.contrast = Number($("contrast").value);
    state.adjustments.gamma = Number($("gamma").value) / 100;
    state.adjustments.saturation = Number($("saturation").value) / 100;
    state.adjustments.sharpen = Number($("sharpen").value);
    state.adjustments.denoise = Number($("denoise").value);
    state.adjustments.backgroundSubtract = Number($("backgroundSubtract").value);
    state.adjustments.toneMap = $("toneMap").checked;
    state.adjustments.toneMapMin = $("toneMapMin").value || "#000000";
    state.adjustments.toneMapMax = $("toneMapMax").value || "#ffffff";
    state.adjustments.invert = $("invert").checked;
    state.adjustments.flipX = false;
    state.adjustments.flipY = false;
    state.adjustments.rotation = 0;
  }

  function updateCropMeta() {
    if (!els.cropMeta) return;
    const region = state.cropRegion;
    const applied = state.adjustments.crop;
    if (region) {
      els.cropMeta.textContent = `Region ${region.x}, ${region.y}, ${region.width} x ${region.height}`;
    } else if (applied) {
      els.cropMeta.textContent = `Applied ${applied.x}, ${applied.y}, ${applied.width} x ${applied.height}`;
    } else {
      els.cropMeta.textContent = "No crop region selected.";
    }
  }

  function syncOverlayCropInputs() {
    const crop = normalizedOverlayCrop();
    if (els.overlayCropLeft) els.overlayCropLeft.value = Math.round(crop.left);
    if (els.overlayCropTop) els.overlayCropTop.value = Math.round(crop.top);
    if (els.overlayCropRight) els.overlayCropRight.value = Math.round(crop.right);
    if (els.overlayCropBottom) els.overlayCropBottom.value = Math.round(crop.bottom);
  }

  function readOverlayCropFromInputs() {
    state.overlayCrop = normalizedOverlayCrop();
    state.overlayCrop.left = Number(els.overlayCropLeft && els.overlayCropLeft.value) || 0;
    state.overlayCrop.top = Number(els.overlayCropTop && els.overlayCropTop.value) || 0;
    state.overlayCrop.right = Number(els.overlayCropRight && els.overlayCropRight.value) || 0;
    state.overlayCrop.bottom = Number(els.overlayCropBottom && els.overlayCropBottom.value) || 0;
    state.overlayCrop = normalizedOverlayCrop();
    syncOverlayCropInputs();
  }

  function applyCropRegion() {
    if (!state.image) return;
    if (!state.cropRegion) {
      alert("Draw a crop region on the image first.");
      return;
    }
    state.adjustments.crop = normalizeCrop(state.cropRegion, state.image.width, state.image.height);
    state.cropRegion = null;
    renderProcessedImage();
    fitToScreen();
    pushHistory("crop");
    updateAll();
  }

  function syncSelectedControls() {
    const obj = selectedObject();
    const isOverlay = state.selected && state.selected.kind === "overlay" && obj;
    ["selectedOpacity", "selectedX", "selectedY", "selectedScaleX", "selectedScaleY", "selectedRotation", "selectedSkewX", "selectedVisible", "selectedLocked"].forEach((idName) => {
      $(idName).disabled = !isOverlay;
    });
    $("selectedVisible").disabled = true;
    if (!isOverlay) return;
    $("selectedOpacity").value = Math.round(obj.opacity * 100);
    $("selectedX").value = Math.round(obj.x);
    $("selectedY").value = Math.round(obj.y);
    $("selectedScaleX").value = Number(obj.scaleX).toFixed(2);
    $("selectedScaleY").value = Number(obj.scaleY).toFixed(2);
    $("selectedRotation").value = Math.round(obj.rotation);
    $("selectedSkewX").value = Math.round(obj.skewX || 0);
    $("selectedVisible").checked = true;
    $("selectedLocked").checked = obj.locked;
  }

  function applySelectedControls() {
    const obj = selectedObject();
    if (!obj || !state.selected || state.selected.kind !== "overlay") return;
    obj.opacity = Number($("selectedOpacity").value) / 100;
    obj.x = Number($("selectedX").value) || 0;
    obj.y = Number($("selectedY").value) || 0;
    const scaleX = parseFloat($("selectedScaleX").value);
    const scaleY = parseFloat($("selectedScaleY").value);
    obj.scaleX = isNaN(scaleX) ? 1 : scaleX;
    obj.scaleY = isNaN(scaleY) ? 1 : scaleY;
    obj.rotation = Number($("selectedRotation").value) || 0;
    obj.skewX = Number($("selectedSkewX").value) || 0;
    state.overlays.forEach((overlay) => {
      overlay.visible = overlay.id === obj.id;
    });
    obj.locked = $("selectedLocked").checked;
    $("selectedVisible").checked = true;
    draw();
    updateLayerList();
    updateOverlayList();
  }

  function removeOverlay(overlayId) {
    const removed = state.overlays.find((item) => item.id === overlayId);
    if (!removed) return;
    const wasActive = state.selected && state.selected.kind === "overlay" && state.selected.id === overlayId;
    const transform = activeOverlay() ? overlayVisualTransform(activeOverlay()) : overlayVisualTransform(removed);
    const ordered = state.overlays.slice().sort((a, b) => a.zIndex - b.zIndex);
    const removedIndex = ordered.findIndex((overlay) => overlay.id === overlayId);
    state.overlays = state.overlays.filter((item) => item.id !== overlayId);

    if (!state.overlays.length) {
      state.selected = null;
    } else if (wasActive || !activeOverlay()) {
      const remaining = state.overlays.slice().sort((a, b) => a.zIndex - b.zIndex);
      const next = remaining[Math.min(Math.max(removedIndex, 0), remaining.length - 1)];
      applyOverlayVisualTransform(next, transform);
      state.overlays.forEach((overlay) => {
        overlay.visible = overlay.id === next.id;
      });
      state.selected = { kind: "overlay", id: next.id };
    } else {
      ensureSingleActiveOverlay();
      normalizeOverlayFootprint();
    }

    pushHistory("delete overlay");
    updateAll();
  }

  function deleteSelected() {
    if (!state.selected) return;
    if (state.selected.kind === "annotation") {
      state.annotations = state.annotations.filter((item) => item.id !== state.selected.id);
    } else if (state.selected.kind === "overlay") {
      removeOverlay(state.selected.id);
      return;
    }
    state.selected = null;
    pushHistory("delete selected");
    updateAll();
  }

  function reorderSelected(direction) {
    const obj = selectedObject();
    if (!obj || !state.selected || state.selected.kind !== "overlay") return;
    obj.zIndex += direction;
    const sorted = [...state.overlays].sort((a, b) => a.zIndex - b.zIndex);
    sorted.forEach((overlay, index) => {
      overlay.zIndex = index + 1;
    });
    pushHistory("reorder overlay");
    updateAll();
  }

  function cycleOverlaySelection(direction) {
    if (!state.overlays.length) return;
    const overlays = state.overlays.slice().sort((a, b) => a.zIndex - b.zIndex);
    const currentIndex = state.selected && state.selected.kind === "overlay"
      ? overlays.findIndex((overlay) => overlay.id === state.selected.id)
      : -1;
    const start = currentIndex >= 0 ? currentIndex : (direction > 0 ? -1 : 0);
    const nextIndex = (start + direction + overlays.length) % overlays.length;
    activateOverlay(overlays[nextIndex].id);
  }

  function updateImageMeta() {
    if (!state.image) {
      els.imageMeta.textContent = "No image loaded";
      return;
    }
    const processed = activeImageCanvas();
    els.imageMeta.innerHTML = `
      <strong>${escapeHtml(state.image.fileName)}</strong><br>
      Original ${state.image.width} × ${state.image.height} · ${fileSize(state.image.fileSize)}<br>
      Working ${processed.width} × ${processed.height}
    `;
  }

  function updateAll() {
    updateImageMeta();
    updateCropMeta();
    syncOverlayCropInputs();
    updateLayerList();
    updateOverlayList();
    updateSignatureList();
    updateResults();
    syncSelectedControls();
    updateUndoRedo();
    draw();
  }

  function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));
  }

  function applyTheme(mode) {
    const dark = mode === "dark";
    document.body.classList.toggle("dark-mode", dark);
    if (els.themeToggleBtn) {
      els.themeToggleBtn.textContent = dark ? "☼" : "◐";
      els.themeToggleBtn.title = dark ? "Switch to light mode" : "Switch to dark mode";
      els.themeToggleBtn.setAttribute("aria-pressed", String(dark));
    }
  }

  function toggleTheme() {
    const next = document.body.classList.contains("dark-mode") ? "light" : "dark";
    applyTheme(next);
    draw();
  }

  function clearLegacyBrowserPersistence() {
    try {
      window.localStorage && localStorage.removeItem("sage-theme");
    } catch (_) {
      // Storage access can be blocked by browser privacy settings.
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch((err) => console.warn("Legacy service worker cleanup failed:", err));
    }

    if ("caches" in window) {
      caches.keys()
        .then((keys) => Promise.all(keys.filter((key) => key.startsWith("sage-")).map((key) => caches.delete(key))))
        .catch((err) => console.warn("Legacy cache cleanup failed:", err));
    }
  }

  function bindEvents() {
    const onClick = (idName, handler) => {
      const el = $(idName);
      if (el) el.addEventListener("click", handler);
    };

    els.imageInput.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        await loadImageFromFile(file);
      } catch (error) {
        alert(error.message);
      } finally {
        event.target.value = "";
      }
    });

    els.overlayImageInput.addEventListener("change", async (event) => {
      const files = event.target.files ? [...event.target.files] : [];
      if (!files.length) return;
      if (!state.image) {
        alert("Load a base image before adding overlays.");
        event.target.value = "";
        return;
      }
      try {
        await addOverlayImages(files);
      } catch (error) {
        alert(error.message);
      } finally {
        event.target.value = "";
      }
    });

    els.projectImportInput.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        await importProject(file);
      } catch (error) {
        alert(`Project import failed: ${error.message}`);
      } finally {
        event.target.value = "";
      }
    });

    if (els.signatureImportInput) {
      els.signatureImportInput.addEventListener("change", async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        try {
          const imported = JSON.parse(await file.text());
          const signatures = Array.isArray(imported) ? imported : imported.signatures;
          if (!Array.isArray(signatures)) throw new Error("Expected an array or { signatures }.");
          signatures.forEach(validateSignature);
          state.signatures = signatures;
          pushHistory("import signatures");
          updateSignatureList();
        } catch (error) {
          alert(`Signature import failed: ${error.message}`);
        } finally {
          event.target.value = "";
        }
      });
    }

    adjustmentIds.forEach((inputId) => {
      const input = $(inputId);
      const isToggle = input.type === "checkbox" || input.tagName === "SELECT";
      if (!isToggle) {
        input.addEventListener("input", () => {
          if (!state.image) return;
          readAdjustmentsFromInputs();
          renderProcessedImage();
          draw();
          updateImageMeta();
        });
      }
      input.addEventListener("change", () => {
        if (!state.image) return;
        readAdjustmentsFromInputs();
        renderProcessedImage();
        if (state.viewLocked) fitToScreen();
        pushHistory("adjust image");
        updateAll();
      });
    });

    document.querySelectorAll("#toolButtons button").forEach((button) => {
      button.addEventListener("click", () => {
        state.tool = button.dataset.tool;
        document.querySelectorAll("#toolButtons button").forEach((item) => item.classList.toggle("active", item === button));
      });
    });

    ["showProcessed", "showAnnotations", "showOverlays"].forEach((idName) => {
      const input = $(idName);
      if (!input) return;
      input.addEventListener("change", () => {
        const key = idName.replace(/^show/, "");
        const normalized = key.charAt(0).toLowerCase() + key.slice(1);
        state.layerVisibility[normalized] = input.checked;
        draw();
      });
    });

    ["selectedOpacity", "selectedX", "selectedY", "selectedScaleX", "selectedScaleY", "selectedRotation", "selectedSkewX", "selectedVisible", "selectedLocked"].forEach((idName) => {
      const input = $(idName);
      input.addEventListener("input", applySelectedControls);
      input.addEventListener("change", () => {
        applySelectedControls();
        pushHistory("edit overlay transform");
      });
    });

    ["overlayCropLeft", "overlayCropTop", "overlayCropRight", "overlayCropBottom"].forEach((idName) => {
      const input = $(idName);
      if (!input) return;
      input.addEventListener("input", () => {
        readOverlayCropFromInputs();
        draw();
      });
      input.addEventListener("change", () => {
        readOverlayCropFromInputs();
        pushHistory("soft crop overlays");
        updateAll();
      });
    });

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    onClick("newProjectBtn", () => {
      if (!window.confirm("Start a new project? Unsaved in-memory data will be cleared.")) return;
      state.image = null;
      state.adjustments = defaultAdjustments();
      state.overlayCrop = { left: 0, top: 0, right: 0, bottom: 0 };
      state.annotations = [];
      state.overlays = [];
      state.results = [];
      state.selected = null;
      state.cropRegion = null;
      state.viewLocked = true;
      syncAdjustmentInputs();
      updateViewLockControl();
      pushHistory("new project");
      updateAll();
    });
    onClick("themeToggleBtn", toggleTheme);
    onClick("viewLockBtn", toggleViewLock);
    onClick("fitViewBtn", () => {
      state.viewLocked = true;
      updateViewLockControl();
      fitViewToWindow();
    });
    onClick("undoBtn", undo);
    onClick("redoBtn", redo);
    onClick("resetImageBtn", resetToOriginal);
    onClick("resetAdjustmentsBtn", resetToOriginal);
    onClick("resetOverlayCropBtn", () => {
      state.overlayCrop = { left: 0, top: 0, right: 0, bottom: 0 };
      syncOverlayCropInputs();
      pushHistory("reset overlay crop");
      updateAll();
    });
    onClick("applyCropBtn", applyCropRegion);
    onClick("clearCropBtn", () => {
      state.adjustments.crop = null;
      state.cropRegion = null;
      syncAdjustmentInputs();
      renderProcessedImage();
      if (state.viewLocked) fitToScreen();
      pushHistory("clear crop");
      updateAll();
    });
    onClick("deleteSelectedBtn", deleteSelected);
    onClick("signatureFromAnnotationsBtn", makeSignatureFromAnnotations);
    onClick("overlayFromSignatureBtn", () => addOverlayFromSignature(selectedSignature()));
    onClick("bringForwardBtn", () => reorderSelected(1.5));
    onClick("sendBackwardBtn", () => reorderSelected(-1.5));
    onClick("exportProjectBtn", exportProject);
    onClick("exportPngBtn", exportPng);
    onClick("exportAnnotationsBtn", () => downloadJson(state.annotations, `sage-annotations-${timestamp()}.json`));
    onClick("exportSignaturesBtn", () => downloadJson({ signatures: state.signatures }, `sage-signatures-${timestamp()}.json`));
    onClick("exportCsvBtn", exportCsv);
    onClick("compareBtn", compareSignatures);
    onClick("saveSignatureBtn", saveSignatureFromEditor);
    onClick("newSignatureBtn", () => {
      const signature = {
        id: id("sig"),
        name: "New signature",
        category: "",
        species: "",
        product: "",
        gene: "",
        diagnosticTarget: "",
        notes: "",
        lanes: [{ id: id("lane"), label: "Lane 1", xPosition: 0.5, bands: [] }],
        metadata: { coordinateSystem: "normalized" }
      };
      state.signatures.push(signature);
      pushHistory("new signature");
      updateSignatureList();
      if (els.signatureSelect) els.signatureSelect.value = signature.id;
      updateSignatureEditor();
    });
    onClick("duplicateSignatureBtn", () => {
      const sig = selectedSignature();
      if (!sig) return;
      const copy = clone(sig);
      copy.id = id("sig");
      copy.name = `${copy.name} copy`;
      state.signatures.push(copy);
      pushHistory("duplicate signature");
      updateSignatureList();
      if (els.signatureSelect) els.signatureSelect.value = copy.id;
      updateSignatureEditor();
    });
    onClick("deleteSignatureBtn", () => {
      const sig = selectedSignature();
      if (!sig) return;
      state.signatures = state.signatures.filter((item) => item.id !== sig.id);
      pushHistory("delete signature");
      updateSignatureList();
    });
    if (els.signatureSearch) els.signatureSearch.addEventListener("input", updateSignatureList);
    if (els.signatureSelect) els.signatureSelect.addEventListener("change", updateSignatureEditor);

    window.addEventListener("resize", resizeWorkspace);
    window.addEventListener("keydown", (event) => {
      const isTextInput = document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if (!isTextInput && ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        cycleOverlaySelection(event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        if (isTextInput) return;
        deleteSelected();
      }
    });
  }

  function init() {
    clearLegacyBrowserPersistence();
    applyTheme("light");
    bindEvents();
    updateViewLockControl();
    syncAdjustmentInputs();
    syncOverlayCropInputs();
    updateSignatureList();
    updateLayerList();
    updateOverlayList();
    updateResults();
    resizeWorkspace();
    pushHistory("initial");
    syncSelectedControls();
  }

  init();

  window.SAGE = {
    state,
    loadImageFromFile,
    createWorkingImage,
    resetToOriginal,
    compareSignatures,
    exportProject
  };
})();
