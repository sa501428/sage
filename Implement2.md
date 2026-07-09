## Canvas and Overlay Implementation Recommendation

SAGE should use a client-side canvas framework, preferably **Fabric.js**, for interactive image composition and overlay manipulation.

The uploaded gel/blot image should be treated as a locked, non-selectable base image. All annotations, reference signatures, imported overlays, labels, lanes, bands, and generated objects should be separate editable overlay layers above the base image.

Each overlay layer should support:

* Move
* Scale
* Rotate
* Skew
* Resize
* Reorder
* Hide/show
* Lock/unlock
* Delete
* Opacity adjustment
* Export

Overlay objects should be represented with a consistent data model:

```ts
type OverlayObject = {
  id: string;
  type: "image" | "signature" | "lane" | "band" | "shape" | "text" | "annotation" | "group";
  source: "upload" | "signature-library" | "manual" | "analysis-generated";
  visible: boolean;
  locked: boolean;
  opacity: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  skewX: number;
  skewY: number;
  zIndex: number;
  data: Record<string, unknown>;
};
```

The layer panel should remain synchronized with canvas objects. Reordering layers should update canvas z-order. Visibility toggles should update object visibility. Locking should disable selection and editing.

SAGE should use Fabric.js object transforms where possible instead of manually recalculating pixel positions.

Reference signatures may be converted into grouped overlay objects containing lanes, bands, markers, labels, and regions. These grouped overlays should behave like normal layers and should be movable, transformable, hideable, lockable, and exportable.

The app should support explicit local export of:

* PNG composition
* SVG composition
* Project JSON
* Annotation JSON
* Signature JSON
* Match result CSV

Project JSON should store canvas state, image metadata, enhancement settings, annotations, reference signatures, overlay transforms, and analysis results. Raw image inclusion should be optional and user-controlled.

A calibration/alignment step should be included so imported reference signatures can be mapped to the base image using either pixel coordinates, normalized coordinates, or user-selected control points.
