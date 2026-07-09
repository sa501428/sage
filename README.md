# SAGE

**Signature Analysis for Gel-based Experiments**

## Overview

SAGE is an interactive application for analyzing gel electrophoresis images. The software enables users to upload gel images, enhance image quality, annotate observed bands, align known reference signatures, and compare observed patterns against a library of standardized signatures.

The system is designed to support both manual expert interpretation and automated pattern matching.

---

# Primary Workflow

1. Upload a gel image.
2. Enhance the image for visualization.
3. Choose one of two analysis modes:

   * Manual Annotation
   * Reference Overlay
4. Compare the observed pattern against known signatures.
5. Display similarity scores and ranked candidate matches.
6. Export images, annotations, and analysis results.

---

# Functional Requirements

## 1. Image Upload

Support common image formats:

* PNG
* JPEG
* TIFF

Multiple images may be opened in separate workspaces.

The original image must always remain unchanged.

---

## 2. Image Enhancement

Provide non-destructive image processing, including:

* Brightness adjustment
* Contrast adjustment
* Gamma correction
* Color/intensity scaling
* Saturation adjustment (if applicable)
* Sharpening
* Noise reduction
* Background subtraction
* Crop
* Rotate
* Flip
* Undo/Redo

Display processed and original images side-by-side.

---

## 3. Manual Annotation Mode

Allow users to manually identify gel features.

Supported tools:

* Draw lane boundaries
* Draw band markers
* Draw lines or regions
* Label annotations
* Move/edit/delete annotations
* Adjust annotation visibility

Annotations should be stored independently from the image.

Provide a cleaned "signature view" generated from annotations.

Annotations should be exportable and reusable.

---

## 4. Reference Overlay Mode

Users can load reference signatures from a library.

Reference overlays should support:

* Translation
* Rotation
* Uniform scaling
* Independent X/Y scaling
* Opacity adjustment
* Layer ordering
* Visibility toggle

Advanced alignment should support mild geometric warping to compensate for gel distortion, including:

* Top/bottom width adjustments
* Perspective correction
* Local deformation using control points

Users should be able to manually align overlays to observed gel patterns.

---

## 5. Signature Library

Maintain a database of reference signatures.

Each signature may contain:

* Name
* Identifier
* Category
* Species
* Product
* Gene
* Diagnostic target
* Lane definitions
* Expected band positions
* Expected relative intensities
* Metadata
* Notes

Support importing and exporting signature libraries.

---

## 6. Signature Comparison

Support comparison between:

* Manual annotations
* Reference overlays
* Image-derived signal profiles

Potential comparison algorithms include:

* Band presence/absence
* Lane-by-lane comparison
* Relative intensity comparison
* Signal profile correlation
* Cosine similarity
* Cross-correlation
* Dynamic Time Warping (optional)
* Machine learning classification
* Embedding-based similarity (future)

Return:

* Similarity score
* Confidence estimate
* Ranked candidate matches

---

## 7. Automated Image Analysis (Future)

Potential automated capabilities:

* Lane detection
* Band detection
* Peak detection
* Background estimation
* Intensity normalization
* Automatic overlay alignment
* Automatic signature suggestion

Manual correction should always remain available.

---

## 8. Results View

Present:

* Original image
* Enhanced image
* Annotation layer
* Reference overlay
* Alignment controls
* Candidate matches
* Similarity scores
* Confidence values
* Match explanation

Users should be able to toggle visualization layers independently.

---

## 9. Export

Support export of:

* Annotated images
* Overlay images
* PDF reports
* CSV comparison results
* JSON annotation data
* Signature definitions

---

# Non-Functional Requirements

* Non-destructive editing
* Responsive UI
* Modular architecture
* Extensible comparison algorithms
* Reproducible analysis
* Plugin-friendly design for future ML models

---

# Design Philosophy

SAGE should prioritize expert-assisted analysis rather than fully automated interpretation. Users should be able to manually adjust annotations and overlays at every stage while leveraging quantitative similarity metrics and future AI-assisted matching. The architecture should remain modular so that additional image-processing, alignment, and machine learning algorithms can be incorporated without redesigning the core application.
