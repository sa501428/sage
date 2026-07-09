# SAGE Web Implementation Instructions

## Project Name

**SAGE — Signature Analysis for Gel-based Experiments**

SAGE is a local-first, client-side web application for analyzing gel, blot, and lane/band-based assay images. It must run in modern browsers on Windows and macOS. No uploaded images, annotations, overlays, signatures, or results may ever be transmitted to a server.

---

## Core Principle

SAGE must be implemented as a **fully client-side application**.

Requirements:

* No backend server for image processing.
* No cloud storage.
* No telemetry.
* No automatic upload.
* No external API calls involving user data.
* Uploaded files are processed only in browser memory.
* Data is saved only when the user explicitly exports/downloads it.
* The original uploaded image must remain unchanged.

---

## Recommended Stack

Use:

* **HTML**
* **CSS**
* **JavaScript or TypeScript**
* **Canvas API** for image rendering and manipulation
* **SVG or Canvas overlay layer** for annotations
* **OpenCV.js** for advanced image processing, if needed
* **IndexedDB only if optional local persistence is explicitly enabled**
* **File API / Blob API** for import and export

Preferred framework:

* React + TypeScript, or
* Vanilla TypeScript if keeping the project lightweight

Optional desktop packaging:

* Tauri wrapper for Windows/macOS desktop builds

---

## Application Layout

Implement a multi-panel interface:

1. **Left sidebar**

   * Upload image
   * Image enhancement controls
   * Annotation tools
   * Overlay tools
   * Signature library

2. **Main workspace**

   * Image canvas
   * Annotation layer
   * Overlay layer
   * Zoom/pan controls

3. **Right sidebar**

   * Selected object properties
   * Similarity scores
   * Candidate matches
   * Export controls

4. **Top toolbar**

   * New project
   * Import signature
   * Export project
   * Undo/redo
   * Privacy status indicator: “Local only”

---

## Image Upload

Implement file upload for:

* PNG
* JPEG
* TIFF, if feasible
* WebP, optional

Behavior:

* Load image using the browser File API.
* Store the original image in memory as an immutable source.
* Create a working copy for processing.
* Show filename, dimensions, and file size.
* Do not upload the file anywhere.

Required functions:

```ts
loadImageFromFile(file: File): Promise<ImageData | HTMLImageElement>
createWorkingImage(original: ImageData): ImageData
resetToOriginal(): void
```

---

## Image Enhancement

Implement non-destructive image adjustments.

Controls:

* Brightness
* Contrast
* Gamma
* Saturation/color intensity
* Invert image
* Grayscale
* Sharpen
* Blur/noise reduction
* Background subtraction
* Crop
* Rotate
* Flip horizontal/vertical

Implementation requirements:

* Store enhancement settings separately from the original image.
* Re-render the processed image whenever settings change.
* Allow reset of individual settings.
* Allow full reset to original.

Suggested state model:

```ts
type ImageAdjustmentState = {
  brightness: number;
  contrast: number;
  gamma: number;
  saturation: number;
  grayscale: boolean;
  invert: boolean;
  sharpen: number;
  denoise: number;
  backgroundSubtract: number;
  rotation: number;
  crop: CropRect | null;
  flipX: boolean;
  flipY: boolean;
};
```

---

## Canvas Workspace

Implement:

* Zoom
* Pan
* Fit to screen
* Actual size
* Coordinate mapping between screen space and image space
* Layer visibility toggles

Layers:

1. Base image layer
2. Processed image layer
3. Manual annotation layer
4. Reference overlay layer
5. Measurement/selection layer

Important:

* All annotation coordinates should be stored in image coordinates, not screen coordinates.
* Zoom and pan should not alter underlying data.
* Export should render selected layers at full resolution.

---

## Manual Annotation Mode

Users must be able to mark observed lanes, bands, and regions.

Tools:

* Lane line tool
* Band marker tool
* Free line tool
* Rectangle/region tool
* Polygon/freeform region tool
* Text label tool
* Select/move/resize/delete tool

Annotation object model:

```ts
type Annotation = {
  id: string;
  type: "lane" | "band" | "line" | "rect" | "polygon" | "label";
  points: Point[];
  label?: string;
  color?: string;
  confidence?: number;
  laneId?: string;
  bandId?: string;
  visible: boolean;
  locked: boolean;
};
```

Required behavior:

* Users can edit annotations after drawing.
* Users can label lanes and bands.
* Users can mark faint or ambiguous bands.
* Users can toggle annotation visibility.
* Users can generate a cleaned signature view from annotations.

---

## Reference Overlay Mode

Users must be able to load known signatures and align them over the uploaded image.

Overlay transforms must support:

* Move
* Rotate
* Uniform scale
* X/Y scale
* Opacity
* Horizontal/vertical flip
* Perspective correction
* Top/bottom width adjustment
* Control-point warping, optional but desirable

Overlay model:

```ts
type SignatureOverlay = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  transform: {
    x: number;
    y: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
    skewX?: number;
    skewY?: number;
    perspective?: PerspectiveTransform;
    controlPoints?: ControlPoint[];
  };
  lanes: SignatureLane[];
};
```

The user must be able to manually align the overlay to the image and save the aligned transform.

---

## Signature Library

Implement a local signature library.

A signature represents an expected lane/band pattern.

Signature model:

```ts
type Signature = {
  id: string;
  name: string;
  category?: string;
  species?: string;
  product?: string;
  gene?: string;
  diagnosticTarget?: string;
  notes?: string;
  lanes: SignatureLane[];
  metadata?: Record<string, string>;
};
```

Lane model:

```ts
type SignatureLane = {
  id: string;
  label: string;
  xPosition: number;
  bands: SignatureBand[];
};
```

Band model:

```ts
type SignatureBand = {
  id: string;
  yPosition: number;
  expectedIntensity?: number;
  tolerance?: number;
  label?: string;
};
```

Library features:

* Import JSON signature library.
* Export JSON signature library.
* Add/edit/delete signatures.
* Add/edit/delete lanes and bands.
* Search/filter signatures.
* Duplicate existing signatures as templates.

Do not store the library in the cloud.

---

## Signature Comparison

Implement comparison between:

1. Manual annotations and reference signatures
2. Image-derived intensity profiles and reference signatures
3. One overlay and another overlay

Initial algorithms:

### Presence/Absence Matching

Compare whether expected bands are present within positional tolerance.

Return:

```ts
type MatchResult = {
  signatureId: string;
  signatureName: string;
  score: number;
  confidence?: number;
  matchedBands: number;
  missingBands: number;
  extraBands: number;
  details: MatchDetail[];
};
```

### Cosine Similarity

Convert lanes or full signatures into numeric vectors and calculate cosine similarity.

Use for:

* Band intensity comparison
* Lane profile comparison
* Whole-signature comparison

### Cross-Correlation

Use to compare intensity profiles where there may be slight vertical shift.

### Optional Future Algorithms

* Dynamic Time Warping
* Peak detection
* ML-based classifier
* Embedding-based similarity
* Automatic best-fit overlay alignment

---

## Intensity Extraction

Implement tools for extracting signal intensity from the image.

Capabilities:

* Sample intensity along a lane.
* Sample intensity within a band region.
* Normalize lane intensity.
* Background subtract local region.
* Generate intensity profile plot.

Data model:

```ts
type IntensityProfile = {
  laneId: string;
  values: number[];
  normalizedValues: number[];
  yStart: number;
  yEnd: number;
};
```

Use this data for similarity scoring.

---

## Results View

Display:

* Ranked candidate signatures
* Similarity score
* Confidence estimate, if available
* Matched bands
* Missing bands
* Extra bands
* Visual overlay of match/mismatch
* Explanation of why a match was selected

Example result fields:

```ts
type AnalysisResult = {
  imageId: string;
  timestamp: string;
  selectedSignatureId?: string;
  matchResults: MatchResult[];
  annotationsUsed: string[];
  overlaysUsed: string[];
  settingsUsed: ImageAdjustmentState;
};
```

---

## Export Requirements

Support explicit local export only.

Export formats:

* PNG: annotated image
* PNG: cleaned signature view
* JSON: project file
* JSON: annotation data
* JSON: signature library
* CSV: match results
* PDF report, optional

Project export should include:

* Image metadata
* Enhancement settings
* Annotations
* Overlay transforms
* Selected signatures
* Match results

It should not automatically include the raw image unless the user chooses that option.

---

## Privacy Requirements

Add a visible privacy notice:

> SAGE runs locally in your browser. Images and analysis data are not uploaded, backed up, or transmitted. Save or export files manually if you want to keep them.

Technical requirements:

* Do not use analytics.
* Do not use remote logging.
* Do not call external APIs with image or project data.
* Avoid third-party scripts loaded from CDNs in production.
* Bundle all dependencies locally.
* Provide an offline-capable build.
* Consider adding a Content Security Policy blocking network requests.

---

## Offline Support

Implement as a Progressive Web App if feasible.

Requirements:

* App can load without internet after installation.
* Static assets are cached locally.
* No data is synced.
* User data remains local.

Optional:

* Add “Install SAGE” button for browser-based app installation.

---

## Undo/Redo

Implement command-based undo/redo for:

* Image adjustment changes
* Annotation creation
* Annotation edits
* Overlay movement/scaling/rotation
* Signature edits

Suggested pattern:

```ts
type Command = {
  do(): void;
  undo(): void;
};
```

---

## File Structure

Suggested project structure:

```txt
/src
  /components
    CanvasWorkspace.tsx
    Toolbar.tsx
    LeftSidebar.tsx
    RightSidebar.tsx
    SignatureLibrary.tsx
    ResultsPanel.tsx

  /image
    loadImage.ts
    imageAdjustments.ts
    intensityExtraction.ts
    imageExport.ts

  /annotations
    annotationTypes.ts
    annotationTools.ts
    annotationRenderer.ts

  /overlays
    overlayTypes.ts
    overlayTransforms.ts
    overlayRenderer.ts

  /signatures
    signatureTypes.ts
    signatureLibrary.ts
    signatureImportExport.ts

  /analysis
    presenceAbsenceMatch.ts
    cosineSimilarity.ts
    crossCorrelation.ts
    matchRanking.ts

  /privacy
    networkGuard.ts
    localOnlyNotice.ts

  /state
    projectState.ts
    undoRedo.ts

  /export
    exportJson.ts
    exportCsv.ts
    exportPng.ts
    exportPdf.ts
```

---

## MVP Scope

Build the first version with:

1. Local image upload
2. Brightness/contrast/gamma controls
3. Crop/rotate
4. Zoom/pan canvas
5. Manual lane and band annotation
6. Reference overlay import
7. Overlay move/scale/rotate/opacity
8. JSON signature library import/export
9. Presence/absence matching
10. Cosine similarity scoring
11. PNG and JSON export
12. No server, no cloud, no telemetry

---

## Later Features

Add later:

* Perspective correction
* Control-point warping
* Automated lane detection
* Automated band detection
* Background subtraction
* Intensity profile plots
* Batch analysis
* ML-based matching
* PDF report generation
* Tauri desktop packaging
* Full offline PWA installation

---

## Acceptance Criteria

The implementation is acceptable only if:

* A user can load an image without uploading it.
* The app functions without a backend.
* The original image is preserved.
* A user can enhance the image visually.
* A user can annotate lanes and bands.
* A user can import and align a reference signature.
* A user can compare annotations against signatures.
* A user can export results locally.
* Closing the browser loses unsaved work unless the user explicitly exported or locally saved it.
* No user data leaves the device.
