# tomatoAnalyzer.py
# AGMARK Tomato Quality Analyzer
# Source: Fruits and Vegetables Grading and Marking Rules, 2004
#         Directorate of Marketing and Inspection, Govt. of India
#
# HOW THIS WORKS (read this before touching anything):
#
#   The main pipeline (main.py) sends us a SAM-segmented tomato image
#   with a pure black background. We dont need to worry about separating
#   the tomato from the background - SAM already did that.
#
#   We do four things in order:
#     1. Colour analysis  - how red/green/yellow/brown is this tomato
#     2. Shape analysis   - is it round or deformed
#     3. Defect analysis  - dark spots, bruises on the surface
#     4. Scar analysis    - cracks and elongated scars
#
#   Then we Grade it as EXTRA / CLASS1 / CLASS2 by AGMARK rules.
#
#   The pixels_per_cm value comes from the COIN detected in main.py.
#   A 22mm reference coin is detected by YOLO, its pixel diameter is
#   measured, and from that we get how many pixels = 1 cm in THIS image.
#   Without this, defect areas and scar lengths would be meaningless numbers.
#
# DEBUG IMAGES:
#   Every analysis step saves a visual image to DEBUG_DIR so u can SEE
#   exactly what the algorithm found. if a tomato is graded wrong, look
#   at these images first before changing any threshold.
#
#   Files written per tomato:
#     00_input.jpg           - raw image entering the analyser
#     01_mask.jpg            - binary mask showing what we think is tomato
#     02_colour.jpg          - false colour map of red/yellow/green/brown regions
#     03_shape.jpg           - contour, convex hull, defect points drawn on image
#     04_defects.jpg         - EXACTLY where dark spots were found (red contours)
#     05_scars.jpg           - 4-panel: CLAHE input, canny edges, scar map, final overlay
#     06_final.jpg           - full annotated output with AGMARK panel

import cv2
import numpy as np
from dataclasses import dataclass, field
from typing import Tuple, List, Optional
import math
import os
import time


# ── Where debug images get saved ────────────────────────────────────────────
# Change this path to wherever ur project output folder is
DEBUG_DIR = r"D:\COLLEGE STUFF\sem7\Final_Year_project_finalML\output\debug"


def _dbg(filename: str, img: np.ndarray):
    """Write one debug image to disk. Creates the folder if its not there yet."""
    os.makedirs(DEBUG_DIR, exist_ok=True)
    cv2.imwrite(os.path.join(DEBUG_DIR, filename), img)
    print(f"    [dbg] wrote  {filename}")


# a small helper - burns white text onto an image at given coords
# used everywhere to label debug panels so u know what ur looking at
def _label(img: np.ndarray, text: str, x: int, y: int,
           colour=(255, 255, 255), scale=0.42, bold=False):
    cv2.putText(img, text, (x, y),
                cv2.FONT_HERSHEY_SIMPLEX, scale, colour,
                2 if bold else 1, cv2.LINE_AA)


# =============================================================================
# HSV COLOUR RANGES  (OpenCV: H 0-179, S 0-255, V 0-255)
# these ranges were tuned by looking at hundreds of tomato images under
# different lighting. dont change them unless u have a good reason
# =============================================================================

RED_LOWER_1  = np.array([0,   80,  60], dtype=np.uint8)
RED_UPPER_1  = np.array([10, 255, 255], dtype=np.uint8)
RED_LOWER_2  = np.array([160, 80,  60], dtype=np.uint8)
RED_UPPER_2  = np.array([179,255, 255], dtype=np.uint8)

PINK_LOWER   = np.array([140, 40, 100], dtype=np.uint8)
PINK_UPPER   = np.array([165,200, 255], dtype=np.uint8)

YELLOW_LOWER = np.array([18,  60,  80], dtype=np.uint8)
YELLOW_UPPER = np.array([38, 255, 255], dtype=np.uint8)

GREEN_LOWER  = np.array([35,  40,  40], dtype=np.uint8)
GREEN_UPPER  = np.array([85, 255, 255], dtype=np.uint8)

BROWN_LOWER  = np.array([8,   40,  30], dtype=np.uint8)
BROWN_UPPER  = np.array([20, 200, 160], dtype=np.uint8)

BLACK_LOWER  = np.array([0,    0,   0], dtype=np.uint8)
BLACK_UPPER  = np.array([179, 80,  60], dtype=np.uint8)


# =============================================================================
# AGMARK THRESHOLDS
# Every number here comes directly from the official AGMARK grading rules.
# DO NOT tweak these to make ur tomatoes grade better - thats cheating
# =============================================================================

THRESHOLDS = {
    "EXTRA": {
        "min_red_pct":           85.0,
        "max_non_red_pct":       12.0,
        "max_yellow_pct":         8.0,
        "max_green_pct":          0.0,
        "max_brown_pct":          1.0,
        "max_black_pct":          4.0,
        "max_defect_area_sqcm":   0.5,
        "min_circularity":        0.78,
        "max_aspect_ratio":       1.3,
        "max_convexity_defects":  2,
        "max_scar_length_cm":     0.3,
        "max_crack_length_cm":    0.3,
    },
    "CLASS1": {
        "min_red_pct":           55.0,
        "max_non_red_pct":       16.0,
        "max_yellow_pct":        12.0,
        "max_green_pct":          8.0,
        "max_brown_pct":          7.0,
        "max_black_pct":          2.0,
        "max_defect_area_sqcm":   1.0,
        "min_circularity":        0.75,
        "max_aspect_ratio":       1.5,
        "max_convexity_defects":  5,
        "max_scar_length_cm":     1.0,
        "max_crack_length_cm":    1.0,
    },
    "CLASS2": {
        "min_red_pct":            0.0,
        "max_non_red_pct":      100.0,
        "max_yellow_pct":       100.0,
        "max_green_pct":        100.0,
        "max_brown_pct":         15.0,
        "max_black_pct":         10.0,
        "max_defect_area_sqcm":   2.0,
        "min_circularity":        0.55,
        "max_aspect_ratio":       1.70,
        "max_convexity_defects":  12,
        "max_scar_length_cm":     3.0,
        "max_crack_length_cm":    3.0,
    }
}


# =============================================================================
# DATA CLASSES  (plain containers, no logic here)
# =============================================================================

@dataclass
class ColourReport:
    red_pct:             float = 0.0
    pink_pct:            float = 0.0
    yellow_pct:          float = 0.0
    green_pct:           float = 0.0
    brown_pct:           float = 0.0
    black_pct:           float = 0.0
    other_pct:           float = 0.0
    total_tomato_pixels: int   = 0


@dataclass
class ShapeReport:
    circularity:           float = 0.0
    aspect_ratio:          float = 0.0
    convexity_ratio:       float = 0.0
    convexity_defects:     int   = 0
    estimated_diameter_px: float = 0.0
    shape_verdict:         str   = ""


@dataclass
class DefectReport:
    defect_area_sqcm:  float = 0.0
    defect_pct:        float = 0.0
    bruise_pct:        float = 0.0
    spot_count:        int   = 0
    largest_spot_sqcm: float = 0.0
    defect_verdict:    str   = ""


@dataclass
class ScarReport:
    scar_count:              int   = 0
    longest_scar_cm:         float = 0.0
    total_scar_area_sqcm:    float = 0.0
    unhealed_crack_detected: bool  = False
    scar_verdict:            str   = ""


@dataclass
class AnalysisResult:
    grade:           str            = ""
    grade_reasons:   List[str]      = field(default_factory=list)
    colour:          ColourReport   = field(default_factory=ColourReport)
    shape:           ShapeReport    = field(default_factory=ShapeReport)
    defects:         DefectReport   = field(default_factory=DefectReport)
    scars:           ScarReport     = field(default_factory=ScarReport)
    annotated_image: Optional[np.ndarray] = field(default=None, repr=False)


# =============================================================================
# SMALL UTILITIES used by multiple modules
# =============================================================================

def _get_primary_contour(mask: np.ndarray):
    """Find the biggest contour in a binary mask. This is always the tomato body."""
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    return max(cnts, key=cv2.contourArea)


def _smooth_contour(contour: np.ndarray) -> np.ndarray:
    """
    Smooth the raw pixel-jagged contour using poly approximation.
    Without this step, circularity scores are way too low because of
    the staircase aliasing on curved edges.
    """
    eps = 0.015 * cv2.arcLength(contour, True)
    return cv2.approxPolyDP(contour, eps, True)


def _extract_tomato_mask(img_bgr: np.ndarray) -> np.ndarray:
    """
    Pull out a binary mask of non-black pixels.
    SAM already removed the background so this is mostly just thresholding
    anything above brightness 15. The morphological ops fill small holes.
    """
    gray    = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    _, mask = cv2.threshold(blurred, 15, 255, cv2.THRESH_BINARY)

    # Close fills holes, open removes  noise on the edge
    k_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    k_open  = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask    = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k_close)
    mask    = cv2.morphologyEx(mask, cv2.MORPH_OPEN,  k_open)
    return mask


def _make_canvas(h: int, w: int, rows: int = 0) -> np.ndarray:
    """Dark grey canvas - looks better than pure black for debug images."""
    return np.full((h + rows, w, 3), 18, dtype=np.uint8)


# =============================================================================
# MODULE 1 - COLOUR ANALYSIS
# =============================================================================

def _analyse_colour(img_bgr: np.ndarray,
                    tomato_mask: np.ndarray,
                    prefix: str) -> ColourReport:
    """
    Measure how much of the tomato surface is each colour.
    We work in HSV because its much easier to define colour ranges there
    than in BGR. Each colour gets a binary mask, then we count pixels.
    """
    report   = ColourReport()
    total_px = int(np.count_nonzero(tomato_mask))
    if total_px == 0:
        return report

    report.total_tomato_pixels = total_px
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)

    # Red wraps around in HSV (hue 0-10 AND 160-179 are both red)
    # so we need two ranges and combine them
    red1       = cv2.inRange(hsv, RED_LOWER_1, RED_UPPER_1)
    red2       = cv2.inRange(hsv, RED_LOWER_2, RED_UPPER_2)
    red_mask   = cv2.bitwise_and(cv2.bitwise_or(red1, red2), tomato_mask)
    pink_mask  = cv2.bitwise_and(cv2.inRange(hsv, PINK_LOWER,   PINK_UPPER),   tomato_mask)
    yell_mask  = cv2.bitwise_and(cv2.inRange(hsv, YELLOW_LOWER, YELLOW_UPPER), tomato_mask)
    grn_mask   = cv2.bitwise_and(cv2.inRange(hsv, GREEN_LOWER,  GREEN_UPPER),  tomato_mask)
    brn_mask   = cv2.bitwise_and(cv2.inRange(hsv, BROWN_LOWER,  BROWN_UPPER),  tomato_mask)
    blk_mask   = cv2.bitwise_and(cv2.inRange(hsv, BLACK_LOWER,  BLACK_UPPER),  tomato_mask)

    report.red_pct    = np.count_nonzero(red_mask)  / total_px * 100.0
    report.pink_pct   = np.count_nonzero(pink_mask) / total_px * 100.0
    report.yellow_pct = np.count_nonzero(yell_mask) / total_px * 100.0
    report.green_pct  = np.count_nonzero(grn_mask)  / total_px * 100.0
    report.brown_pct  = np.count_nonzero(brn_mask)  / total_px * 100.0
    report.black_pct  = np.count_nonzero(blk_mask)  / total_px * 100.0
    accounted         = (report.red_pct + report.pink_pct + report.yellow_pct +
                         report.green_pct + report.brown_pct + report.black_pct)
    report.other_pct  = max(0.0, 100.0 - accounted)

    # ── DEBUG IMAGE 02 ───────────────────────────────────────────────────────
    # Build a false-colour map where each colour region gets painted with a
    # distinct solid colour. Blend 40% original + 60% colour map so u can
    # still see the tomato texture underneath.
    #
    # colour legend:
    #   Warm Red   → pixels we classified as red/pink  (ripe)
    #   Cyan       → yellow regions  (semi-ripe)
    #   Bright Green → green regions  (unripe)
    #   Dark Orange  → brown/bruise regions
    #   Dark Grey    → black/dark spot regions
    colour_map = np.zeros_like(img_bgr)
    colour_map[red_mask  > 0] = (50,  50, 220)    # red shown as warm red
    colour_map[pink_mask > 0] = (180, 80, 220)    # pink - slightly purple
    colour_map[yell_mask > 0] = (0,  220, 220)    # yellow - cyan
    colour_map[grn_mask  > 0] = (0,  200,  60)    # green - bright green
    colour_map[brn_mask  > 0] = (40, 100, 160)    # brown - dark orange
    colour_map[blk_mask  > 0] = (80,  80,  80)    # black - grey

    # blend and mask out the background
    blend = cv2.addWeighted(img_bgr, 0.35, colour_map, 0.65, 0)
    blend = cv2.bitwise_and(blend, blend, mask=tomato_mask)

    h, w     = img_bgr.shape[:2]
    # Give room at bottom for a legend bar
    LEGEND_H = 100
    canvas   = _make_canvas(h, w, LEGEND_H)
    canvas[:h, :w] = blend

    # Draw the legend with coloured squares and percentage values
    # so when u look at the debug image u dont have to guess
    legend_items = [
        ((50,  50, 220),  f"Red   {report.red_pct:.1f}%"),
        ((0,  220, 220),  f"Yell  {report.yellow_pct:.1f}%"),
        ((0,  200,  60),  f"Green {report.green_pct:.1f}%"),
        ((40, 100, 160),  f"Brown {report.brown_pct:.1f}%"),
        ((80,  80,  80),  f"Black {report.black_pct:.1f}%"),
        ((180, 80, 220),  f"Pink  {report.pink_pct:.1f}%"),
    ]
    lx = 8
    for (bgr_col, text) in legend_items:
        cv2.rectangle(canvas, (lx, h + 12), (lx + 18, h + 30), bgr_col, -1)
        _label(canvas, text, lx + 22, h + 26, (220, 220, 220), 0.40)
        lx += 105

    _label(canvas, "STEP 02 - Colour Analysis  (false-colour overlay on tomato)",
           6, h + 55, (255, 255, 200), 0.42, bold=True)
    _label(canvas, f"Red+Pink={report.red_pct+report.pink_pct:.1f}%  "
                   f"Yellow={report.yellow_pct:.1f}%  "
                   f"Green={report.green_pct:.1f}%  "
                   f"Brown={report.brown_pct:.1f}%  "
                   f"Black={report.black_pct:.1f}%",
           6, h + 78, (180, 180, 180), 0.38)

    # Also draw the contour outline so u can see the tomato boundary
    contour = _get_primary_contour(tomato_mask)
    if contour is not None:
        cv2.drawContours(canvas, [contour], -1, (255, 255, 255), 1)

    _dbg(f"{prefix}02_colour.jpg", canvas)
    return report


# =============================================================================
# MODULE 2 - SHAPE ANALYSIS
# =============================================================================

def _analyse_shape(tomato_mask: np.ndarray,
                   img_bgr: np.ndarray,
                   prefix: str) -> ShapeReport:
    """
    Check if the tomato is round enough for Extra/Class1 or deformed.
    Circularity = 4*pi*area / perimeter^2
      - perfect circle = 1.0
      - potato = maybe 0.6
    We also count convexity defects (dents in the outline).
    """
    report      = ShapeReport()
    raw_contour = _get_primary_contour(tomato_mask)
    if raw_contour is None or len(raw_contour) < 5:
        report.shape_verdict = "UNKNOWN"
        return report

    contour   = _smooth_contour(raw_contour)
    area      = cv2.contourArea(contour)
    perimeter = cv2.arcLength(contour, True)
    if perimeter == 0 or area == 0:
        report.shape_verdict = "UNKNOWN"
        return report

    report.circularity         = min((4 * math.pi * area) / (perimeter ** 2), 1.0)
    x, y, bw, bh               = cv2.boundingRect(contour)
    report.aspect_ratio        = max(bw, bh) / max(min(bw, bh), 1)
    report.estimated_diameter_px = (bw + bh) / 2.0

    hull_pts           = cv2.convexHull(contour)
    hull_area          = cv2.contourArea(hull_pts)
    report.convexity_ratio = area / hull_area if hull_area > 0 else 1.0

    hull_idx = cv2.convexHull(contour, returnPoints=False)
    defect_points = []    # store for drawing later
    if hull_idx is not None and len(hull_idx) > 3:
        try:
            defects = cv2.convexityDefects(contour, hull_idx)
            if defects is not None:
                depth_thr = report.estimated_diameter_px * 0.08
                for d in defects:
                    s, e, f, depth = d[0]
                    if depth / 256.0 > depth_thr:
                        report.convexity_defects += 1
                        defect_points.append(tuple(contour[f][0]))
        except cv2.error:
            pass

    if report.circularity >= 0.85 and report.aspect_ratio <= 1.15:
        report.shape_verdict = "ROUND"
    elif report.circularity >= 0.75 and report.aspect_ratio <= 1.30:
        report.shape_verdict = "SLIGHTLY_DEFORMED"
    else:
        report.shape_verdict = "DEFORMED"

    # ── DEBUG IMAGE 03 ────────────────────────────────────────────────────────
    # Draw EVERYTHING we measured directly onto the image so its obvious
    # what the algorithm is doing:
    #   Blue thick line   = smoothed contour (what we measure circularity from)
    #   Yellow thin line  = convex hull (the tightest convex boundary)
    #   Grey dashed box   = bounding rectangle (used for aspect ratio)
    #   Red filled dots   = convexity defect points (dents deeper than 8% of diameter)
    #   Cyan crosshair    = centroid of the tomato

    h, w     = img_bgr.shape[:2]
    PANEL_H  = 80
    canvas   = _make_canvas(h, w, PANEL_H)
    canvas[:h, :w] = img_bgr.copy()

    # convex hull in yellow
    hull_draw = cv2.convexHull(contour)
    cv2.drawContours(canvas, [hull_draw], -1, (0, 220, 220), 1)

    # smoothed contour in blue (drawn on top of hull)
    cv2.drawContours(canvas, [contour], -1, (255, 80, 0), 2)

    # bounding rect in white dashed style
    # opencv doesnt have dashed lines natively so we draw segments manually
    pt1, pt2 = (x, y), (x + bw, y + bh)
    dash_len = 8
    for ix in range(x, x + bw, dash_len * 2):
        cv2.line(canvas, (ix, y),          (min(ix + dash_len, x + bw), y),          (180, 180, 180), 1)
        cv2.line(canvas, (ix, y + bh),     (min(ix + dash_len, x + bw), y + bh),     (180, 180, 180), 1)
    for iy in range(y, y + bh, dash_len * 2):
        cv2.line(canvas, (x,      iy),     (x,      min(iy + dash_len, y + bh)),     (180, 180, 180), 1)
        cv2.line(canvas, (x + bw, iy),     (x + bw, min(iy + dash_len, y + bh)),     (180, 180, 180), 1)

    # Red dots at every convexity defect - these are the "dents" in the tomato
    for pt in defect_points:
        cv2.circle(canvas, pt, 6, (0, 0, 255), -1)
        cv2.circle(canvas, pt, 6, (0, 200, 255), 1)   # orange ring around it

    # centroid cross
    cx_c = x + bw // 2
    cy_c = y + bh // 2
    cv2.line(canvas, (cx_c - 12, cy_c), (cx_c + 12, cy_c), (0, 255, 255), 1)
    cv2.line(canvas, (cx_c, cy_c - 12), (cx_c, cy_c + 12), (0, 255, 255), 1)

    # metrics panel at the bottom
    verdict_col = (50, 220, 50) if report.shape_verdict == "ROUND" else \
                  (50, 200, 255) if report.shape_verdict == "SLIGHTLY_DEFORMED" else \
                  (60, 60, 255)

    _label(canvas, "STEP 03 - Shape Analysis   "
                   "(blue=contour, yellow=hull, grey=bbox, red=defect pts)",
           6, h + 18, (255, 255, 200), 0.40, bold=True)
    _label(canvas, f"Circularity:{report.circularity:.3f}   "
                   f"Aspect Ratio:{report.aspect_ratio:.3f}   "
                   f"Convexity Defects:{report.convexity_defects}   "
                   f"Verdict:{report.shape_verdict}",
           6, h + 42, verdict_col, 0.40)
    _label(canvas, f"Bounding box: {bw}x{bh}px   "
                   f"Est.diameter: {report.estimated_diameter_px:.0f}px   "
                   f"Convexity ratio:{report.convexity_ratio:.3f}",
           6, h + 62, (160, 160, 160), 0.38)

    _dbg(f"{prefix}03_shape.jpg", canvas)
    return report


# =============================================================================
# MODULE 3 - SURFACE DEFECT ANALYSIS
# =============================================================================

def _analyse_defects(img_bgr: np.ndarray,
                     tomato_mask: np.ndarray,
                     colour: ColourReport,
                     pixels_per_cm: float,
                     prefix: str) -> DefectReport:
    """
    Detect dark spots, bruises, physical damage on the surface.

    Strategy:
      1. Find the median brightness of tomato pixels
      2. Pixels darker than 50% of median = candidate dark spots
      3. Combine with HSV brown+black mask to remove false positives
         (shadows on round surfaces also look dark but arent defects)
      4. Morphological filtering to keep only blob-like regions

    The pixels_per_cm comes from the coin reference so areas are in real sq.cm
    """
    report   = DefectReport()
    total_px = colour.total_tomato_pixels
    if total_px == 0:
        return report

    gray        = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    tomato_gray = cv2.bitwise_and(gray, tomato_mask)

    tomato_vals = tomato_gray[tomato_mask > 0]
    if len(tomato_vals) == 0:
        return report

    # Adaptive threshold based on ACTUAL brightness of THIS tomato
    # using a fixed number like 80 would fail on dark red vs bright orange tomatoes
    median_val   = float(np.median(tomato_vals))
    dark_thresh  = max(10, median_val * 0.50)

    _, dark_mask = cv2.threshold(tomato_gray, int(dark_thresh), 255, cv2.THRESH_BINARY_INV)
    dark_mask    = cv2.bitwise_and(dark_mask, tomato_mask)
    k_open       = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    dark_mask    = cv2.morphologyEx(dark_mask, cv2.MORPH_OPEN, k_open)

    # cross-check with HSV - only keep dark pixels that are also brown or black in hue
    # this filters out normal shadows on the curved surface
    hsv      = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    brn_m    = cv2.bitwise_and(cv2.inRange(hsv, BROWN_LOWER, BROWN_UPPER), tomato_mask)
    blk_m    = cv2.bitwise_and(cv2.inRange(hsv, BLACK_LOWER, BLACK_UPPER), tomato_mask)
    anomaly  = cv2.bitwise_or(brn_m, blk_m)

    # union of pure-dark and colour-confirmed defects to catch both types
    combined = cv2.bitwise_or(cv2.bitwise_and(dark_mask, anomaly), dark_mask)
    combined = cv2.bitwise_and(combined, tomato_mask)
    k_close  = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, k_close)
    

    defect_cnts, _ = cv2.findContours(
        combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )

    spot_areas      = []
    filtered_cnts   = []
    for cnt in defect_cnts:
        a = cv2.contourArea(cnt)
        if a > 30:    # ignore single-pixel noise
            spot_areas.append(a)
            filtered_cnts.append(cnt)

    report.spot_count        = len(spot_areas)
    total_defect_px          = sum(spot_areas)
    report.defect_pct        = total_defect_px / total_px * 100.0
    px2_per_sqcm             = pixels_per_cm ** 2
    report.defect_area_sqcm  = total_defect_px / px2_per_sqcm
    report.largest_spot_sqcm = max(spot_areas, default=0) / px2_per_sqcm
    report.bruise_pct        = colour.brown_pct

    if   report.defect_area_sqcm <= 0.1:  report.defect_verdict = "NONE"
    elif report.defect_area_sqcm <= 0.5:  report.defect_verdict = "VERY_SLIGHT"
    elif report.defect_area_sqcm <= 1.0:  report.defect_verdict = "SLIGHT"
    elif report.defect_area_sqcm <= 2.0:  report.defect_verdict = "MODERATE"
    else:                                  report.defect_verdict = "SEVERE"

    # ── DEBUG IMAGE 04 ────────────────────────────────────────────────────────
    # Left  = original tomato with EVERY detected defect outlined in red
    #         and a yellow dot at its centroid
    # Right = the binary defect mask so u can see what the algorithm "sees"
    # Bottom bar = summary numbers
    #
    # if this image shows red outlines on places that arent defects,
    # ur threshold is too low and ur picking up shadows as defects

    h, w    = img_bgr.shape[:2]
    PANEL_H = 70
    GUTTER  = 16

    # LEFT panel - original with defect overlays
    left = img_bgr.copy()

    # Shade the entire defect region with semi-transparent red tint
    defect_overlay = left.copy()
    defect_overlay[combined > 0] = [0, 0, 200]
    left = cv2.addWeighted(left, 0.65, defect_overlay, 0.35, 0)

    # Draw contour outlines and label each spot with its area in sqcm
    for i, cnt in enumerate(filtered_cnts):
        cv2.drawContours(left, [cnt], -1, (0, 0, 255), 2)
        M = cv2.moments(cnt)
        if M["m00"] > 0:
            cx = int(M["m10"] / M["m00"])
            cy = int(M["m01"] / M["m00"])
            cv2.circle(left, (cx, cy), 4, (0, 255, 255), -1)
            spot_sqcm = cv2.contourArea(cnt) / px2_per_sqcm
            _label(left, f"{spot_sqcm:.2f}cm2", cx + 6, cy - 4, (0, 255, 255), 0.32)

    _label(left, f"Spots:{report.spot_count}  "
                 f"Total:{report.defect_area_sqcm:.3f}sqcm  "
                 f"Largest:{report.largest_spot_sqcm:.3f}sqcm",
           4, 18, (0, 255, 255), 0.40)

    # RIGHT panel - binary mask visualized in false colour
    # white = detected as defect, black = clean surface, grey border = background
    right = np.full_like(img_bgr, 30)   # dark background
    right[tomato_mask > 0] = [60, 60, 60]          # clean tomato surface in grey
    right[combined     > 0] = [0, 100, 255]         # defect pixels in orange

    _label(right, "Defect mask", 4, 18, (200, 200, 200), 0.40)

    # Side by side
    canvas = _make_canvas(h, w * 2 + GUTTER, PANEL_H)
    canvas[:h, :w]                  = left
    canvas[:h, w + GUTTER:]         = right

    # Vertical separator line
    cv2.line(canvas, (w + GUTTER // 2, 0), (w + GUTTER // 2, h), (50, 50, 50), 1)

    verdict_col = (50, 220, 50)  if report.defect_verdict in ("NONE", "VERY_SLIGHT") else \
                  (50, 200, 255) if report.defect_verdict == "SLIGHT" else \
                  (60, 60, 255)

    _label(canvas,
           f"STEP 04 - Surface Defects   "
           f"(red contour = defect, yellow dot = centre, orange on right = defect mask)",
           6, h + 18, (255, 255, 200), 0.40, bold=True)
    _label(canvas,
           f"Spots: {report.spot_count}   "
           f"Total Defect Area: {report.defect_area_sqcm:.3f} sq.cm   "
           f"Largest Spot: {report.largest_spot_sqcm:.3f} sq.cm   "
           f"Verdict: {report.defect_verdict}",
           6, h + 40, verdict_col, 0.40)
    _label(canvas,
           f"Median brightness: {median_val:.0f}   "
           f"Dark threshold: {dark_thresh:.0f}   "
           f"pixels_per_cm: {pixels_per_cm:.2f}   "
           f"px2_per_sqcm: {px2_per_sqcm:.0f}",
           6, h + 60, (130, 130, 130), 0.36)

    _dbg(f"{prefix}04_defects.jpg", canvas)
    return report


# MOD 4 - SCAR AND CRACK ANALYSIS
# =============================================================================

## add new colours of scar basiclaly like skin colour, cream colour, and shates of white
## also add new colour of crack like dark red, dark brown, and black
#


def _analyse_scars(img_bgr: np.ndarray,
                   tomato_mask: np.ndarray,
                   shape: ShapeReport,
                   pixels_per_cm: float,
                   prefix: str) -> ScarReport:
    """
    Detect scars (elongated surface marks) and unhealed cracks.

    Strategy for scars:
      1. CLAHE equalization to make faint scars more visible
      2. Canny edge detection on equalized image
      3. Strip edges within 25px of tomato boundary (those are just the silhouette)
      4. Morphological merge to connect broken scar segments
      5. Keep only elongated blobs (aspect ratio > 2.5) of reasonable size

    Strategy for unhealed cracks:
      1. Very dark V-channel pixels (< 35) inside the inner mask area
      2. Elongated contours of those dark regions = open wound in the flesh
    """
    report = ScarReport()
    if shape.estimated_diameter_px == 0:
        return report

    gray        = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    tomato_gray = cv2.bitwise_and(gray, tomato_mask)

    # CLAHE makes faint scars pop out without blowing up noise
    clahe     = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    equalized = clahe.apply(tomato_gray)

    edges = cv2.Canny(equalized, threshold1=40, threshold2=120)
    edges = cv2.bitwise_and(edges, tomato_mask)

    # Erode the mask to get a guard band - edges near the tomato silhouette
    # are NOT scars, they are just the outer boundary. Excluding them is important.
    border_k   = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
    inner_mask = cv2.erode(tomato_mask, border_k, iterations=3)
    edges      = cv2.bitwise_and(edges, inner_mask)

    # Merge horizontal and vertical scar segments separately then OR them
    # this handles scars that go in any direction
    sv = cv2.morphologyEx(edges, cv2.MORPH_CLOSE,
                          cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 9)))
    sh = cv2.morphologyEx(edges, cv2.MORPH_CLOSE,
                          cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 3)))
    scar_map = cv2.bitwise_or(sv, sh)
    scar_map = cv2.dilate(scar_map,
                          cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)),
                          iterations=1)

    scar_cnts, _ = cv2.findContours(
        scar_map, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )

    scar_lengths  = []
    scar_areas    = []
    filtered_cnts = []
    min_len_px    = shape.estimated_diameter_px * 0.03  # must be at least 3% of dia

    for cnt in scar_cnts:
        area = cv2.contourArea(cnt)
        if area < 200:
            continue
        sx, sy, sw, sh2 = cv2.boundingRect(cnt)
        length_px = math.sqrt(sw**2 + sh2**2)
        elongation = max(sw, sh2) / max(min(sw, sh2), 1)
        if elongation < 2.5 or length_px < min_len_px:
            continue    # not elongated enough to be a scar
        scar_lengths.append(length_px / pixels_per_cm)
        scar_areas.append(area)
        filtered_cnts.append(cnt)

    report.scar_count           = len(scar_lengths)
    report.longest_scar_cm      = max(scar_lengths, default=0.0)
    report.total_scar_area_sqcm = sum(scar_areas) / (pixels_per_cm ** 2)

    # Unhealed crack = very dark elongated region deep inside the tomato
    # different from a scar because its a physical split in the flesh
    hsv      = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    v_chan   = hsv[:, :, 2]
    _, dark_line = cv2.threshold(v_chan, 35, 255, cv2.THRESH_BINARY_INV)
    dark_line    = cv2.bitwise_and(dark_line, inner_mask)

    crack_cnts, _ = cv2.findContours(
        dark_line, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    crack_overlay_cnts = []   # collect for drawing
    for cnt in crack_cnts:
        if cv2.contourArea(cnt) < 100:
            continue
        cx2, cy2, cw2, ch2 = cv2.boundingRect(cnt)
        asp = max(cw2, ch2) / max(min(cw2, ch2), 1)
        if asp > 4.0:
            report.unhealed_crack_detected = True
            crack_overlay_cnts.append(cnt)

    if report.scar_count == 0 and not report.unhealed_crack_detected:
        report.scar_verdict = "NONE"
    elif report.longest_scar_cm <= 1.0 and not report.unhealed_crack_detected:
        report.scar_verdict = "SLIGHT"
    elif report.longest_scar_cm <= 3.0 and not report.unhealed_crack_detected:
        report.scar_verdict = "MODERATE"
    else:
        report.scar_verdict = "SEVERE"

    # ── DEBUG IMAGE 05 ────────────────────────────────────────────────────────
    # Four-panel layout showing every step of the scar detection pipeline:
    #
    # TOP LEFT  : CLAHE enhanced image - this is literally what Canny sees
    #             bright scars should pop out clearly here
    # TOP RIGHT : Canny edges after inner mask guard band applied
    #             should show edges INSIDE the tomato, not on its boundary
    # BOT LEFT  : Scar map after morphological merging
    #             each blob here will be evaluated for elongation
    # BOT RIGHT : Final overlay on original tomato
    #             Magenta outlines = scars found
    #             Red outlines     = unhealed cracks
    #             Grey tint area   = border guard zone (excluded from analysis)

    h, w   = img_bgr.shape[:2]

    p1 = cv2.cvtColor(equalized, cv2.COLOR_GRAY2BGR)       # CLAHE grey
    p2 = cv2.cvtColor(edges,     cv2.COLOR_GRAY2BGR)       # Canny edges
    p3 = cv2.cvtColor(scar_map,  cv2.COLOR_GRAY2BGR)       # scar map blobs

    p4 = img_bgr.copy()
    # Show the excluded border zone as a subtle grey tint
    guard_zone = cv2.subtract(tomato_mask, inner_mask)
    grey_tint  = p4.copy()
    grey_tint[guard_zone > 0] = [60, 60, 60]
    p4 = cv2.addWeighted(p4, 0.7, grey_tint, 0.3, 0)

    # draw every accepted scar contour in magenta (thick so its visible)
    for cnt in filtered_cnts:
        cv2.drawContours(p4, [cnt], -1, (255, 0, 255), 2)
        sx2, sy2, sw2, sh3 = cv2.boundingRect(cnt)
        length_cm = math.sqrt(sw2**2 + sh3**2) / pixels_per_cm
        # label each scar with its length in cm
        _label(p4, f"{length_cm:.2f}cm",
               sx2, max(sy2 - 4, 12), (255, 100, 255), 0.36)

    # draw unhealed cracks in bright red - these are more serious than scars
    for cnt in crack_overlay_cnts:
        cv2.drawContours(p4, [cnt], -1, (0, 0, 255), 2)

    # Add small legend to the overlay panel
    _label(p4, "Magenta=scar  Red=crack  Grey=excluded zone",
           4, h - 8, (200, 200, 200), 0.35)

    # Assemble into 2x2 grid
    row1   = np.hstack([p1, p2])
    row2   = np.hstack([p3, p4])
    grid   = np.vstack([row1, row2])
    gh, gw = grid.shape[:2]

    # panel labels on the four quadrants
    _label(grid, "CLAHE enhanced (Canny input)",    4, 16, (200, 200, 200))
    _label(grid, "Canny edges (inner mask guard)",  w + 4, 16, (200, 200, 200))
    _label(grid, "Scar map (morph merged blobs)",   4, h + 16, (200, 200, 200))
    scar_lbl_col = (50, 220, 50) if report.scar_verdict == "NONE" else \
                   (50, 200, 255) if report.scar_verdict == "SLIGHT" else \
                   (60, 60, 255)
    _label(grid,
           f"Final overlay  Scars:{report.scar_count}  "
           f"Longest:{report.longest_scar_cm:.2f}cm  "
           f"Crack:{'YES' if report.unhealed_crack_detected else 'No'}",
           w + 4, h + 16, scar_lbl_col)

    # Footer bar
    FOOTER_H = 30
    footer   = _make_canvas(0, gw, FOOTER_H)
    _label(footer,
           f"STEP 05 - Scar & Crack Analysis   Verdict:{report.scar_verdict}   "
           f"Total scar area:{report.total_scar_area_sqcm:.3f}sq.cm   "
           f"min_len_px:{min_len_px:.0f}",
           6, 18, (255, 255, 200), 0.40, bold=True)

    final_grid = np.vstack([grid, footer])
    _dbg(f"{prefix}05_scars.jpg", final_grid)
    return report


# =============================================================================
# GRADING ENGINE
# =============================================================================

def _determine_grade(colour:  ColourReport,
                     shape:   ShapeReport,
                     defects: DefectReport,
                     scars:   ScarReport) -> Tuple[str, List[str]]:
    """
    Apply AGMARK thresholds in order Extra -> Class1 -> Class2.
    Collect every failure reason so the annotated image can explain the grade.
    """
    reasons: List[str] = []
    eff_red  = colour.red_pct + colour.pink_pct
    non_red  = colour.yellow_pct + colour.green_pct

    # Check EXTRA first
    extra_fail = []
    t = THRESHOLDS["EXTRA"]
    if eff_red             < t["min_red_pct"]:           extra_fail.append(f"Red+Pink {eff_red:.1f}% < {t['min_red_pct']}% for Extra")
    if colour.green_pct    > t["max_green_pct"]:         extra_fail.append(f"Green {colour.green_pct:.1f}% > 0% allowed for Extra")
    if colour.yellow_pct   > t["max_yellow_pct"]:        extra_fail.append(f"Yellow {colour.yellow_pct:.1f}% > {t['max_yellow_pct']}% for Extra")
    if colour.brown_pct    > t["max_brown_pct"]:         extra_fail.append(f"Brown {colour.brown_pct:.1f}% > {t['max_brown_pct']}% for Extra")
    if colour.black_pct    > t["max_black_pct"]:         extra_fail.append(f"Black {colour.black_pct:.1f}% > {t['max_black_pct']}% for Extra")
    if defects.defect_area_sqcm > t["max_defect_area_sqcm"]: extra_fail.append(f"Defect {defects.defect_area_sqcm:.2f}sqcm > {t['max_defect_area_sqcm']} for Extra")
    if shape.circularity   < t["min_circularity"]:       extra_fail.append(f"Circularity {shape.circularity:.2f} < {t['min_circularity']} for Extra")
    if shape.aspect_ratio  > t["max_aspect_ratio"]:      extra_fail.append(f"Aspect {shape.aspect_ratio:.2f} > {t['max_aspect_ratio']} for Extra")
    if shape.convexity_defects > t["max_convexity_defects"]: extra_fail.append(f"ShapeDefects {shape.convexity_defects} > {t['max_convexity_defects']} for Extra")
    if scars.longest_scar_cm   > t["max_scar_length_cm"]:    extra_fail.append(f"Scar {scars.longest_scar_cm:.2f}cm > {t['max_scar_length_cm']}cm for Extra")
    if scars.unhealed_crack_detected:                         extra_fail.append("Unhealed crack disqualifies Extra and Class I")

    if not extra_fail:
        return "EXTRA", []

    # Check CLASS1
    class1_fail = []
    t = THRESHOLDS["CLASS1"]
    if eff_red           < t["min_red_pct"]:             class1_fail.append(f"Red+Pink {eff_red:.1f}% < {t['min_red_pct']}% for Class I")
    if non_red           > t["max_non_red_pct"]:         class1_fail.append(f"Non-red {non_red:.1f}% > {t['max_non_red_pct']}% for Class I")
    if colour.brown_pct  > t["max_brown_pct"]:           class1_fail.append(f"Brown {colour.brown_pct:.1f}% > {t['max_brown_pct']}% for Class I")
    if colour.black_pct  > t["max_black_pct"]:           class1_fail.append(f"Black {colour.black_pct:.1f}% > {t['max_black_pct']}% for Class I")
    if defects.defect_area_sqcm > t["max_defect_area_sqcm"]: class1_fail.append(f"Defect {defects.defect_area_sqcm:.2f}sqcm > {t['max_defect_area_sqcm']} for Class I")
    if shape.circularity  < t["min_circularity"]:        class1_fail.append(f"Circularity {shape.circularity:.2f} < {t['min_circularity']} for Class I")
    if shape.aspect_ratio > t["max_aspect_ratio"]:       class1_fail.append(f"Aspect {shape.aspect_ratio:.2f} > {t['max_aspect_ratio']} for Class I")
    if scars.longest_scar_cm > t["max_scar_length_cm"]: class1_fail.append(f"Scar {scars.longest_scar_cm:.2f}cm > {t['max_scar_length_cm']}cm for Class I")
    if scars.unhealed_crack_detected:                    class1_fail.append("Unhealed crack - Class I needs only healed cracks under 1cm")

    all_reasons = ([f"[Extra fail]  {r}"  for r in extra_fail] +
                   [f"[Class1 fail] {r}"  for r in class1_fail])

    if not class1_fail:
        return "CLASS1", [f"[Extra fail] {r}" for r in extra_fail]

    return "CLASS2", all_reasons


# =============================================================================
# FINAL ANNOTATED OUTPUT IMAGE
# =============================================================================

def _annotate_image(img_bgr:     np.ndarray,
                    result:      AnalysisResult,
                    tomato_mask: np.ndarray) -> np.ndarray:
    """
    Produce the final annotated output with a side panel showing all metrics.
    The contour of the tomato is drawn in a colour that matches the grade.
    """
    h, w     = img_bgr.shape[:2]
    PANEL_W  = 350
    canvas   = np.zeros((h, w + PANEL_W, 3), dtype=np.uint8)
    canvas[:h, :w] = img_bgr
    canvas[:, w:]  = (20, 20, 30)

    grade_colour = {
        "EXTRA":  (50, 220,  50),
        "CLASS1": (50, 180, 255),
        "CLASS2": (30, 140, 255),
    }.get(result.grade, (200, 200, 200))

    contour = _get_primary_contour(tomato_mask)
    if contour is not None:
        cv2.drawContours(canvas, [contour], -1, grade_colour, 3)

    def put(text, row, colour=(220, 220, 220), scale=0.42, bold=False):
        cv2.putText(canvas, text, (w + 8, row),
                    cv2.FONT_HERSHEY_SIMPLEX, scale, colour,
                    2 if bold else 1, cv2.LINE_AA)

    row = 28; step = 19

    put("AGMARK TOMATO ANALYSER", row, (255, 255, 255), 0.48, True); row += step + 2
    cv2.line(canvas, (w + 5, row), (w + PANEL_W - 5, row), (70, 70, 70), 1); row += 8

    badge = {"EXTRA": "EXTRA CLASS", "CLASS1": "CLASS  I", "CLASS2": "CLASS  II"}.get(result.grade, result.grade)
    put(f"GRADE:  {badge}", row, grade_colour, 0.58, True); row += step + 6
    cv2.line(canvas, (w + 5, row), (w + PANEL_W - 5, row), (50, 50, 50), 1); row += 8

    c = result.colour
    put("COLOUR", row, (180, 180, 255), 0.44, True); row += step
    eff = c.red_pct + c.pink_pct
    put(f"  Red+Pink : {eff:5.1f}%",      row, (50, 220, 50) if eff >= 60 else (80, 80, 255)); row += step
    put(f"  Yellow   : {c.yellow_pct:5.1f}%", row, (0, 220, 220) if c.yellow_pct > 2 else (160, 160, 160)); row += step
    put(f"  Green    : {c.green_pct:5.1f}%",  row, (50, 220, 50) if c.green_pct  > 0 else (160, 160, 160)); row += step
    put(f"  Brown    : {c.brown_pct:5.1f}%",  row, (80, 140, 200) if c.brown_pct > 2 else (160, 160, 160)); row += step
    put(f"  Black    : {c.black_pct:5.1f}%",  row, (80,  80, 255) if c.black_pct > 1 else (160, 160, 160)); row += step + 4

    s = result.shape
    put("SHAPE", row, (180, 255, 180), 0.44, True); row += step
    put(f"  Circularity  : {s.circularity:.3f}",     row); row += step
    put(f"  Aspect Ratio : {s.aspect_ratio:.3f}",    row); row += step
    put(f"  Conv. Ratio  : {s.convexity_ratio:.3f}", row); row += step
    put(f"  Defects      : {s.convexity_defects}",   row); row += step
    verdict_col = (50, 220, 50) if s.shape_verdict == "ROUND" else \
                  (50, 200, 255) if s.shape_verdict == "SLIGHTLY_DEFORMED" else (60, 60, 255)
    put(f"  Verdict      : {s.shape_verdict}", row, verdict_col); row += step + 4

    d = result.defects
    put("SURFACE DEFECTS", row, (255, 200, 180), 0.44, True); row += step
    put(f"  Area         : {d.defect_area_sqcm:.3f} sq.cm", row); row += step
    put(f"  Surface %    : {d.defect_pct:.1f}%",            row); row += step
    put(f"  Spot Count   : {d.spot_count}",                  row); row += step
    put(f"  Largest Spot : {d.largest_spot_sqcm:.3f} sq.cm", row); row += step
    dv_col = (50, 220, 50) if d.defect_verdict in ("NONE","VERY_SLIGHT") else \
             (50, 200, 255) if d.defect_verdict == "SLIGHT" else (60, 60, 255)
    put(f"  Verdict      : {d.defect_verdict}", row, dv_col); row += step + 4

    sc = result.scars
    put("SCARS & CRACKS", row, (255, 180, 255), 0.44, True); row += step
    put(f"  Scar Count   : {sc.scar_count}",             row); row += step
    put(f"  Longest Scar : {sc.longest_scar_cm:.2f} cm", row); row += step
    put(f"  Scar Area    : {sc.total_scar_area_sqcm:.3f} sq.cm", row); row += step
    crack_col = (60, 60, 255) if sc.unhealed_crack_detected else (50, 220, 50)
    put(f"  Unhealed Crack: {'YES !' if sc.unhealed_crack_detected else 'No'}", row, crack_col); row += step
    sv_col = (50, 220, 50) if sc.scar_verdict == "NONE" else \
             (50, 200, 255) if sc.scar_verdict == "SLIGHT" else (60, 60, 255)
    put(f"  Verdict      : {sc.scar_verdict}", row, sv_col); row += step + 6

    if result.grade_reasons:
        cv2.line(canvas, (w + 5, row), (w + PANEL_W - 5, row), (50, 50, 50), 1); row += 8
        put("DOWNGRADE REASONS", row, (120, 120, 255), 0.40, True); row += step
        for reason in result.grade_reasons[:8]:
            # wrap long lines
            words, line_buf = reason.split(), ""
            for word in words:
                if len(line_buf) + len(word) + 1 > 44:
                    put(f"  {line_buf.strip()}", row, (155, 140, 200), 0.35); row += step - 4
                    line_buf = word + " "
                else:
                    line_buf += word + " "
            if line_buf.strip():
                put(f"  {line_buf.strip()}", row, (155, 140, 200), 0.35); row += step - 4

    return canvas


# =============================================================================
# PUBLIC ENTRY POINT
# =============================================================================

def analyse_tomato(img_bgr:       np.ndarray,
                   debug:         bool  = False,
                   debug_prefix:  str   = "",
                   pixels_per_cm: float = 50.0) -> AnalysisResult:
    """
    Main entry point called by main.py after SAM segmentation.

    Parameters
    ----------
    img_bgr       : SAM-segmented tomato image, black background
    debug         : if True prints metric breakdown to console
    debug_prefix  : filename prefix for debug images, auto-generated if empty
    pixels_per_cm : scale derived from the reference coin in the scene.
                    This is how many pixels equal 1 centimetre in THIS image.
                    Comes from: 10.0 / mm_per_px  (computed in main.py step 3)
                    Without this, defect areas and scar lengths are wrong.

    Returns
    -------
    AnalysisResult with grade, reasons, sub-reports, and annotated image
    """
    result = AnalysisResult()

    # Auto-generate a unique prefix if caller didnt give one
    # this stops multiple tomatoes from overwriting each others debug files
    if not debug_prefix:
        debug_prefix = f"tomato_{int(time.time())}_"

    print(f"\n  [analyser] Starting analysis  prefix={debug_prefix}  "
          f"pixels_per_cm={pixels_per_cm:.2f}")

    # Step 00 - save the raw input so we have a before-and-after reference
    _dbg(f"{debug_prefix}00_input.jpg", img_bgr)

    # Step 01 - extract tomato mask
    tomato_mask = _extract_tomato_mask(img_bgr)
    total_px    = int(np.count_nonzero(tomato_mask))

    # Build the mask debug image - shows boundary and binary mask side by side
    h, w     = img_bgr.shape[:2]
    GUTTER   = 16
    overlay  = img_bgr.copy()
    contour  = _get_primary_contour(tomato_mask)
    if contour is not None:
        cv2.drawContours(overlay, [contour], -1, (0, 255, 100), 2)
    mask_vis = cv2.cvtColor(tomato_mask, cv2.COLOR_GRAY2BGR)
    mask_canvas = _make_canvas(h, w * 2 + GUTTER, 50)
    mask_canvas[:h, :w]           = overlay
    mask_canvas[:h, w + GUTTER:]  = mask_vis
    _label(mask_canvas, "Original + contour boundary",         4,      18, (200, 200, 200))
    _label(mask_canvas, "Binary mask (white = tomato pixels)", w + GUTTER + 4, 18, (200, 200, 200))
    _label(mask_canvas, f"STEP 01 - Mask Extraction   Total tomato pixels: {total_px}",
           4, h + 32, (255, 255, 200), 0.42, bold=True)
    _dbg(f"{debug_prefix}01_mask.jpg", mask_canvas)

    if total_px < 500:
        # cant do anything sensible with this image
        result.grade          = "CLASS2"
        result.grade_reasons  = ["Could not extract valid tomato region"]
        result.annotated_image = img_bgr.copy()
        return result

    # Step 02 - colour
    result.colour  = _analyse_colour(img_bgr, tomato_mask, debug_prefix)

    # Step 03 - shape
    result.shape   = _analyse_shape(tomato_mask, img_bgr, debug_prefix)

    # Step 04 - defects
    # pixels_per_cm comes from the coin - without it sq.cm areas are guesses
    result.defects = _analyse_defects(img_bgr, tomato_mask,
                                      result.colour, pixels_per_cm, debug_prefix)

    # Step 05 - scars
    result.scars   = _analyse_scars(img_bgr, tomato_mask,
                                    result.shape, pixels_per_cm, debug_prefix)

    # Grade
    result.grade, result.grade_reasons = _determine_grade(
        result.colour, result.shape, result.defects, result.scars
    )

    # Step 06 - final annotated image
    result.annotated_image = _annotate_image(img_bgr, result, tomato_mask)
    _dbg(f"{debug_prefix}06_final.jpg", result.annotated_image)

    if debug:
        _print_debug(result, pixels_per_cm)

    print(f"  [analyser] Done.  Grade={result.grade}  "
          f"Debug images in {DEBUG_DIR}")
    return result


def _print_debug(result: AnalysisResult, pixels_per_cm: float = 0):
    c, s, d, sc = result.colour, result.shape, result.defects, result.scars
    sep = "─" * 52
    print(f"\n{sep}")
    print(f"  AGMARK GRADE    : {result.grade}")
    if pixels_per_cm:
        print(f"  pixels_per_cm   : {pixels_per_cm:.2f}  (from reference coin)")
    print(sep)
    print(f"  COLOUR  Red+Pink={c.red_pct+c.pink_pct:.1f}%  Yellow={c.yellow_pct:.1f}%  "
          f"Green={c.green_pct:.1f}%  Brown={c.brown_pct:.1f}%  Black={c.black_pct:.1f}%")
    print(f"  SHAPE   Circ={s.circularity:.3f}  Aspect={s.aspect_ratio:.3f}  "
          f"Defects={s.convexity_defects}  [{s.shape_verdict}]")
    print(f"  DEFECTS Area={d.defect_area_sqcm:.3f}sqcm  Spots={d.spot_count}  [{d.defect_verdict}]")
    print(f"  SCARS   Count={sc.scar_count}  Longest={sc.longest_scar_cm:.2f}cm  "
          f"Crack={'YES' if sc.unhealed_crack_detected else 'No'}  [{sc.scar_verdict}]")
    if result.grade_reasons:
        print(f"  DOWNGRADE REASONS:")
        for r in result.grade_reasons:
            print(f"    - {r}")
    print(sep)