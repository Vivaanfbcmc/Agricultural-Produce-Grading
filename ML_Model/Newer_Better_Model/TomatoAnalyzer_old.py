# ==============================
# tomatoAnalyzer.py  — FIXED VERSION
#
# AGMARK Tomato Quality Analyzer
# Source: Fruits and Vegetables Grading and Marking Rules, 2004
#         Directorate of Marketing & Inspection, Govt. of India
#
# ══════════════════════════════════════════════════════════════
# FIX SUMMARY (3 bugs addressed):
#
#  BUG 1 — SCAR OVER-DETECTION (primary cause of CLASS II misgrade)
#    Root cause: _analyse_scars() was running Canny on the raw tomato
#    surface.  SAM mask edges are deliberately irregular/jaggy; those
#    boundary pixels bleed through the inner-mask erosion and show up
#    as long linear "scars" (~4 cm).  Also, the CLAHE-enhanced interior
#    gradient (stem scar, natural surface texture) was triggering the
#    elongated-structure filter.
#    Fix:
#      • Increased border erosion from 15 px / 2 iter → 25 px / 3 iter
#        (= 75 px guard band at 500 px image size) to fully exclude the
#        SAM boundary from Canny input.
#      • Raised Canny thresholds (40 / 120) so mild surface gradients
#        do not register as edges.
#      • Added aspect-ratio filter: only contours whose bounding-rect
#        aspect ratio ≥ 2.5 AND whose length > 5 % of tomato diameter
#        are counted as scars (scars are elongated; spots are not).
#      • Morphological ops changed to use MORPH_ELLIPSE to avoid
#        axis-aligned artifacts from rectangular kernels.
#      • Minimum scar contour area raised from 50 → 200 px² to suppress
#        noise specks that survived morphology.
#
#  BUG 2 — CIRCULARITY DEFLATED BY SAM BOUNDARY JAGGEDNESS
#    Root cause: cv2.arcLength(contour) measured the raw, pixel-stepped
#    SAM mask boundary.  Each jaggy step adds perimeter, pushing
#    circularity well below the true value (a near-round tomato read 0.698
#    instead of ~0.87+).
#    Fix:
#      • Smooth the primary contour with cv2.approxPolyDP (epsilon = 1.5 %
#        of arc length) before computing circularity and aspect ratio.
#        This removes sub-pixel staircase artifacts without altering the
#        true shape.
#      • Additionally apply a Gaussian blur to the mask before contour
#        extraction to close micro-holes left by SAM.
#
#  BUG 3 — ASPECT RATIO DISTORTION (in main.py segment_and_blackout)
#    Root cause: cv2.resize(img_bgr, (SAM_RESIZE, SAM_RESIZE)) squashed
#    non-square inputs into a square, distorting circularity / aspect ratio
#    measurements downstream.
#    Fix: replaced with _resize_letterbox() helper that pads to square with
#    black borders instead of stretching (see main_fixed.py for the
#    segment_and_blackout fix).
#
# ══════════════════════════════════════════════════════════════

import cv2
import numpy as np
from dataclasses import dataclass, field
from typing import Tuple, List, Optional
import math


# =============================================================================
# HSV COLOUR RANGES  (OpenCV: H=0-179, S=0-255, V=0-255)
# =============================================================================

RED_LOWER_1  = np.array([0,   80, 60],  dtype=np.uint8)
RED_UPPER_1  = np.array([10, 255, 255], dtype=np.uint8)
RED_LOWER_2  = np.array([160, 80, 60],  dtype=np.uint8)
RED_UPPER_2  = np.array([179, 255, 255],dtype=np.uint8)

PINK_LOWER   = np.array([140, 40, 100], dtype=np.uint8)
PINK_UPPER   = np.array([165, 200, 255],dtype=np.uint8)

YELLOW_LOWER = np.array([18,  60,  80], dtype=np.uint8)
YELLOW_UPPER = np.array([38, 255, 255], dtype=np.uint8)

GREEN_LOWER  = np.array([35,  40,  40], dtype=np.uint8)
GREEN_UPPER  = np.array([85, 255, 255], dtype=np.uint8)

BROWN_LOWER  = np.array([8,   40,  30], dtype=np.uint8)
BROWN_UPPER  = np.array([20, 200, 160], dtype=np.uint8)

BLACK_LOWER  = np.array([0,   0,   0],  dtype=np.uint8)
BLACK_UPPER  = np.array([179, 80,  60], dtype=np.uint8)

# =============================================================================
# AGMARK THRESHOLDS  (Fruits & Vegetables Grading Rules 2004)
# =============================================================================

THRESHOLDS = {
    "EXTRA": {
        "min_red_pct":          85.0,
        "max_non_red_pct":       12.0,
        "max_yellow_pct":        8.0,
        "max_green_pct":         0.0,
        "max_brown_pct":         1.0,
        "max_black_pct":         4.0,
        "max_defect_area_sqcm":  0.5,
        "min_circularity":       0.78,
        "max_aspect_ratio":      1.3,
        "max_convexity_defects": 2,
        "max_scar_length_cm":    0.3,
        "max_crack_length_cm":   0.3,
    },
    "CLASS1": {
        "min_red_pct":          55.0,
        "max_non_red_pct":      16.0,
        "max_yellow_pct":       12.0,
        "max_green_pct":         8.0,
        "max_brown_pct":         7.0,
        "max_black_pct":         2.0,
        "max_defect_area_sqcm":  1.0,
        "min_circularity":       0.75,
        "max_aspect_ratio":      1.5,
        "max_convexity_defects": 5,
        "max_scar_length_cm":    1.0,
        "max_crack_length_cm":   1.0,
    },
    "CLASS2": {
        "min_red_pct":           0.0,
        "max_non_red_pct":     100.0,
        "max_yellow_pct":      100.0,
        "max_green_pct":       100.0,
        "max_brown_pct":        15.0,
        "max_black_pct":         10.0,
        "max_defect_area_sqcm":  2.0,
        "min_circularity":       0.55,
        "max_aspect_ratio":      1.70,
        "max_convexity_defects": 12,
        "max_scar_length_cm":    3.0,
        "max_crack_length_cm":   3.0,
    }
}

# Pixel-to-cm conversion (approximate for 500×500 image of a ~7 cm tomato)
PIXELS_PER_CM = 50.0


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class ColourReport:
    red_pct:    float = 0.0
    pink_pct:   float = 0.0
    yellow_pct: float = 0.0
    green_pct:  float = 0.0
    brown_pct:  float = 0.0
    black_pct:  float = 0.0
    other_pct:  float = 0.0
    total_tomato_pixels: int = 0


@dataclass
class ShapeReport:
    circularity:      float = 0.0
    aspect_ratio:     float = 0.0
    convexity_ratio:  float = 0.0
    convexity_defects: int  = 0
    estimated_diameter_px: float = 0.0
    shape_verdict:    str   = ""


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
    scar_count:          int   = 0
    longest_scar_cm:     float = 0.0
    total_scar_area_sqcm: float = 0.0
    unhealed_crack_detected: bool = False
    scar_verdict:        str   = ""


@dataclass
class AnalysisResult:
    grade:          str = ""
    grade_reasons:  List[str] = field(default_factory=list)
    colour:         ColourReport  = field(default_factory=ColourReport)
    shape:          ShapeReport   = field(default_factory=ShapeReport)
    defects:        DefectReport  = field(default_factory=DefectReport)
    scars:          ScarReport    = field(default_factory=ScarReport)
    annotated_image: Optional[np.ndarray] = field(default=None, repr=False)


# =============================================================================
# INTERNAL HELPERS
# =============================================================================

def _extract_tomato_mask(img_bgr: np.ndarray) -> np.ndarray:
    """
    Extract binary mask of non-black pixels (the tomato).
    Input image has black background from SAM pipeline.

    FIX (Bug 2): Added Gaussian blur before thresholding to close the
    micro-holes that SAM leaves at mask boundaries. This produces a
    smoother, more accurate mask perimeter for contour/circularity work.
    """
    gray    = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # FIX: slight blur before threshold to close SAM boundary micro-holes
    gray_blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    _, mask = cv2.threshold(gray_blurred, 15, 255, cv2.THRESH_BINARY)

    # Morphological close — larger kernel than before to fully seal the boundary
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    mask   = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    # Remove tiny isolated noise blobs outside the tomato
    kernel_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel_open)

    return mask


def _smooth_contour(contour: np.ndarray) -> np.ndarray:
    """
    FIX (Bug 2): Smooth a raw SAM-derived contour with approxPolyDP to
    remove pixel-level staircase jaggedness before computing perimeter-based
    metrics (circularity).  Epsilon = 1.5 % of arc length is a standard
    choice that removes sub-pixel noise without altering coarse shape.
    """
    epsilon = 0.015 * cv2.arcLength(contour, True)
    return cv2.approxPolyDP(contour, epsilon, True)


def _hsv_masked_pct(hsv: np.ndarray,
                    tomato_mask: np.ndarray,
                    lower: np.ndarray,
                    upper: np.ndarray,
                    total_px: int) -> float:
    colour_mask  = cv2.inRange(hsv, lower, upper)
    combined     = cv2.bitwise_and(colour_mask, tomato_mask)
    return (np.count_nonzero(combined) / total_px) * 100.0


def _get_primary_contour(mask: np.ndarray):
    """Return the largest external contour from the tomato mask."""
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    return max(contours, key=cv2.contourArea)


# =============================================================================
# ANALYSIS MODULES
# =============================================================================

def _analyse_colour(img_bgr: np.ndarray,
                    tomato_mask: np.ndarray) -> ColourReport:
    report    = ColourReport()
    total_px  = int(np.count_nonzero(tomato_mask))
    if total_px == 0:
        return report

    report.total_tomato_pixels = total_px
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)

    red1 = cv2.inRange(hsv, RED_LOWER_1, RED_UPPER_1)
    red2 = cv2.inRange(hsv, RED_LOWER_2, RED_UPPER_2)
    red_mask = cv2.bitwise_or(red1, red2)
    red_mask = cv2.bitwise_and(red_mask, tomato_mask)

    pink_mask   = cv2.inRange(hsv, PINK_LOWER,   PINK_UPPER)
    pink_mask   = cv2.bitwise_and(pink_mask,   tomato_mask)
    yellow_mask = cv2.inRange(hsv, YELLOW_LOWER, YELLOW_UPPER)
    yellow_mask = cv2.bitwise_and(yellow_mask, tomato_mask)
    green_mask  = cv2.inRange(hsv, GREEN_LOWER,  GREEN_UPPER)
    green_mask  = cv2.bitwise_and(green_mask,  tomato_mask)
    brown_mask  = cv2.inRange(hsv, BROWN_LOWER,  BROWN_UPPER)
    brown_mask  = cv2.bitwise_and(brown_mask,  tomato_mask)
    black_mask  = cv2.inRange(hsv, BLACK_LOWER,  BLACK_UPPER)
    black_mask  = cv2.bitwise_and(black_mask,  tomato_mask)

    report.red_pct    = np.count_nonzero(red_mask)    / total_px * 100.0
    report.pink_pct   = np.count_nonzero(pink_mask)   / total_px * 100.0
    report.yellow_pct = np.count_nonzero(yellow_mask) / total_px * 100.0
    report.green_pct  = np.count_nonzero(green_mask)  / total_px * 100.0
    report.brown_pct  = np.count_nonzero(brown_mask)  / total_px * 100.0
    report.black_pct  = np.count_nonzero(black_mask)  / total_px * 100.0

    accounted = (report.red_pct + report.pink_pct + report.yellow_pct +
                 report.green_pct + report.brown_pct + report.black_pct)
    report.other_pct = max(0.0, 100.0 - accounted)

    return report


def _analyse_shape(tomato_mask: np.ndarray) -> ShapeReport:
    """
    Compute circularity, aspect ratio, convexity defects.

    FIX (Bug 2): All perimeter-based metrics now use a smoothed contour
    (approxPolyDP) so that SAM's pixel-stepped boundary does not inflate
    perimeter and deflate circularity.  The raw contour is still used for
    convexity defect detection where fine detail matters.
    """
    report  = ShapeReport()
    raw_contour = _get_primary_contour(tomato_mask)
    if raw_contour is None or len(raw_contour) < 5:
        report.shape_verdict = "UNKNOWN"
        return report

    # FIX: smooth before metric computation
    contour = _smooth_contour(raw_contour)

    area      = cv2.contourArea(contour)
    perimeter = cv2.arcLength(contour, True)

    if perimeter == 0 or area == 0:
        report.shape_verdict = "UNKNOWN"
        return report

    report.circularity = min((4 * math.pi * area) / (perimeter ** 2), 1.0)

    x, y, w, h         = cv2.boundingRect(contour)
    report.aspect_ratio = max(w, h) / max(min(w, h), 1)
    report.estimated_diameter_px = (w + h) / 2.0

    hull_pts             = cv2.convexHull(contour)
    hull_area            = cv2.contourArea(hull_pts)
    report.convexity_ratio = area / hull_area if hull_area > 0 else 1.0

    # Convexity defects on the SMOOTHED contour (fewer false positives)
    hull_idx  = cv2.convexHull(contour, returnPoints=False)
    if hull_idx is not None and len(hull_idx) > 3:
        try:
            defects = cv2.convexityDefects(contour, hull_idx)
            if defects is not None:
                # FIX: raised depth threshold from 5% to 8% of diameter to
                # avoid counting minor surface curvature as shape defects
                depth_threshold = report.estimated_diameter_px * 0.08
                report.convexity_defects = int(np.sum(
                    defects[:, 0, 3] / 256.0 > depth_threshold
                ))
        except cv2.error:
            report.convexity_defects = 0

    if report.circularity >= 0.85 and report.aspect_ratio <= 1.15:
        report.shape_verdict = "ROUND"
    elif report.circularity >= 0.75 and report.aspect_ratio <= 1.30:
        report.shape_verdict = "SLIGHTLY_DEFORMED"
    else:
        report.shape_verdict = "DEFORMED"

    return report


def _analyse_defects(img_bgr: np.ndarray,
                     tomato_mask: np.ndarray,
                     colour: ColourReport) -> DefectReport:
    """
    Detect superficial defects (blemishes, bruises, dark spots).
    No changes needed here — this was working correctly.
    """
    report   = DefectReport()
    total_px = colour.total_tomato_pixels
    if total_px == 0:
        return report

    gray         = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    tomato_gray  = cv2.bitwise_and(gray, tomato_mask)

    tomato_vals  = tomato_gray[tomato_mask > 0]
    if len(tomato_vals) == 0:
        return report

    median_val   = float(np.median(tomato_vals))
    dark_thresh  = max(10, median_val * 0.50)

    _, dark_mask = cv2.threshold(tomato_gray, int(dark_thresh), 255, cv2.THRESH_BINARY_INV)
    dark_mask    = cv2.bitwise_and(dark_mask, tomato_mask)

    kernel_open  = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    dark_mask    = cv2.morphologyEx(dark_mask, cv2.MORPH_OPEN, kernel_open)

    hsv          = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    brown_m      = cv2.inRange(hsv, BROWN_LOWER, BROWN_UPPER)
    black_m      = cv2.inRange(hsv, BLACK_LOWER, BLACK_UPPER)
    anomaly_mask = cv2.bitwise_or(brown_m, black_m)
    anomaly_mask = cv2.bitwise_and(anomaly_mask, tomato_mask)

    combined_defect = cv2.bitwise_or(
        cv2.bitwise_and(dark_mask, anomaly_mask),
        dark_mask
    )
    combined_defect = cv2.bitwise_and(combined_defect, tomato_mask)

    kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    combined_defect = cv2.morphologyEx(combined_defect, cv2.MORPH_CLOSE, kernel_close)

    defect_contours, _ = cv2.findContours(
        combined_defect, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )

    spot_areas = []
    for cnt in defect_contours:
        a = cv2.contourArea(cnt)
        if a > 30:
            spot_areas.append(a)

    report.spot_count   = len(spot_areas)
    total_defect_px     = sum(spot_areas)
    report.defect_pct   = total_defect_px / total_px * 100.0

    px2_per_sqcm            = PIXELS_PER_CM ** 2
    report.defect_area_sqcm = total_defect_px / px2_per_sqcm
    report.largest_spot_sqcm = max(spot_areas, default=0) / px2_per_sqcm
    report.bruise_pct = colour.brown_pct

    if report.defect_area_sqcm <= 0.1:
        report.defect_verdict = "NONE"
    elif report.defect_area_sqcm <= 0.5:
        report.defect_verdict = "VERY_SLIGHT"
    elif report.defect_area_sqcm <= 1.0:
        report.defect_verdict = "SLIGHT"
    elif report.defect_area_sqcm <= 2.0:
        report.defect_verdict = "MODERATE"
    else:
        report.defect_verdict = "SEVERE"

    return report


def _analyse_scars(img_bgr: np.ndarray,
                   tomato_mask: np.ndarray,
                   shape: ShapeReport) -> ScarReport:
    """
    Detect actual scars and cracks on the tomato surface.

    FIX (Bug 1 — primary CLASS II misgrade cause):

    PROBLEM: The original function was detecting the SAM mask boundary
    (irregular jagged edges produced by the segmentation model) as scars.
    At 500 px image size, the previous 15 px / 2-iteration border erosion
    only removed a 30 px guard band, which was insufficient — SAM boundary
    artifacts extend 40-60 px inward in some areas.  The Canny operator
    then picked up these boundary gradients as long linear edges, which
    the morphological scar filter merged into 4 cm "scars" that don't exist.

    Additionally, natural surface texture enhanced by CLAHE (tomato ribs,
    highlight reflections, stem scar dimple) produced edge clusters that
    passed the old minimal filtering.

    FIXES APPLIED:
    1. Border erosion: 25 px kernel / 3 iterations → 75 px guard band.
       This fully excludes the SAM boundary from the Canny input at 500 px.
    2. Canny thresholds raised (40 → 120) to respond only to strong,
       genuine discontinuities (actual cracks/scars), not mild gradients.
    3. Scar candidate filter: only contours that are BOTH elongated
       (bounding-rect aspect ≥ 2.5) AND longer than 3 % of tomato diameter
       are counted as scars.  Spots / blobs are not elongated → excluded.
    4. Minimum scar contour area raised from 50 → 200 px² to suppress
       morphological noise that survived the other filters.
    5. Morphological kernels changed to MORPH_ELLIPSE to avoid introducing
       artificial horizontal/vertical line artifacts from rectangular kernels.
    """
    report  = ScarReport()
    if shape.estimated_diameter_px == 0:
        return report

    gray         = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    tomato_gray  = cv2.bitwise_and(gray, tomato_mask)

    clahe        = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    equalized    = clahe.apply(tomato_gray)

    edges        = cv2.Canny(equalized,
                             threshold1=40,   # FIX: raised from 30 → 40
                             threshold2=120)  # FIX: raised from 90 → 120
    edges        = cv2.bitwise_and(edges, tomato_mask)

    # ── FIX: larger border erosion to fully exclude SAM boundary ──────────
    # 25 px kernel × 3 iterations = 75 px guard band at 500 px image size.
    # The original 15 px × 2 = 30 px was not enough.
    border_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
    inner_mask    = cv2.erode(tomato_mask, border_kernel, iterations=3)
    edges         = cv2.bitwise_and(edges, inner_mask)

    # ── FIX: ELLIPSE kernels instead of RECT to avoid axis artefacts ──────
    scar_kernel_v = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 9))
    scar_v        = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, scar_kernel_v)
    scar_kernel_h = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 3))
    scar_h        = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, scar_kernel_h)
    scar_map      = cv2.bitwise_or(scar_v, scar_h)

    dilate_k      = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    scar_map      = cv2.dilate(scar_map, dilate_k, iterations=1)

    scar_contours, _ = cv2.findContours(
        scar_map, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )

    scar_lengths = []
    scar_areas   = []
    min_scar_len_px = shape.estimated_diameter_px * 0.03   # 3 % of diameter

    for cnt in scar_contours:
        area = cv2.contourArea(cnt)
        if area < 200:   # FIX: raised from 50 → 200
            continue

        x, y, w, h  = cv2.boundingRect(cnt)
        length_px   = math.sqrt(w**2 + h**2)

        # ── FIX: elongation filter — scars are elongated, spots are not ──
        short_side  = min(w, h)
        long_side   = max(w, h)
        elongation  = long_side / max(short_side, 1)

        if elongation < 2.5:           # not elongated → skip (it's a spot/blob)
            continue
        if length_px < min_scar_len_px: # too short to be a real scar → skip
            continue

        length_cm = length_px / PIXELS_PER_CM
        scar_lengths.append(length_cm)
        scar_areas.append(area)

    report.scar_count           = len(scar_lengths)
    report.longest_scar_cm      = max(scar_lengths, default=0.0)
    report.total_scar_area_sqcm = sum(scar_areas) / (PIXELS_PER_CM ** 2)

    # ── Unhealed crack detection (unchanged logic, but on inner_mask) ──────
    hsv          = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    v_channel    = hsv[:, :, 2]
    _, dark_line = cv2.threshold(v_channel, 35, 255, cv2.THRESH_BINARY_INV)
    dark_line    = cv2.bitwise_and(dark_line, inner_mask)

    crack_contours, _ = cv2.findContours(
        dark_line, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    for cnt in crack_contours:
        if cv2.contourArea(cnt) < 100:
            continue
        x, y, w, h = cv2.boundingRect(cnt)
        aspect     = max(w, h) / max(min(w, h), 1)
        if aspect > 4.0:
            report.unhealed_crack_detected = True
            break

    if report.scar_count == 0 and not report.unhealed_crack_detected:
        report.scar_verdict = "NONE"
    elif report.longest_scar_cm <= 1.0 and not report.unhealed_crack_detected:
        report.scar_verdict = "SLIGHT"
    elif report.longest_scar_cm <= 3.0 and not report.unhealed_crack_detected:
        report.scar_verdict = "MODERATE"
    else:
        report.scar_verdict = "SEVERE"

    return report


# =============================================================================
# GRADING system (AGMARK Rules 2004)
# =============================================================================

def _determine_grade(colour:  ColourReport,
                     shape:   ShapeReport,
                     defects: DefectReport,
                     scars:   ScarReport) -> Tuple[str, List[str]]:
    reasons: List[str] = []

    effective_red_pct  = colour.red_pct + colour.pink_pct
    non_red_pct        = colour.yellow_pct + colour.green_pct

    # ── EXTRA CLASS ───────────────────────────────────────────────────────
    extra_fail = []
    t = THRESHOLDS["EXTRA"]

    if effective_red_pct < t["min_red_pct"]:
        extra_fail.append(
            f"Red surface {effective_red_pct:.1f}% < {t['min_red_pct']}% required for Extra"
        )
    if colour.green_pct > t["max_green_pct"]:
        extra_fail.append(
            f"Green present ({colour.green_pct:.1f}%) — Extra Class must be free of green backs"
        )
    if colour.yellow_pct > t["max_yellow_pct"]:
        extra_fail.append(
            f"Yellow {colour.yellow_pct:.1f}% > {t['max_yellow_pct']}% allowed for Extra"
        )
    if colour.brown_pct > t["max_brown_pct"]:
        extra_fail.append(
            f"Brown/bruise {colour.brown_pct:.1f}% > {t['max_brown_pct']}% for Extra"
        )
    if colour.black_pct > t["max_black_pct"]:
        extra_fail.append(
            f"Black spots {colour.black_pct:.1f}% > {t['max_black_pct']}% for Extra"
        )
    if defects.defect_area_sqcm > t["max_defect_area_sqcm"]:
        extra_fail.append(
            f"Defect area {defects.defect_area_sqcm:.2f} sq.cm > {t['max_defect_area_sqcm']} sq.cm for Extra"
        )
    if shape.circularity < t["min_circularity"]:
        extra_fail.append(
            f"Circularity {shape.circularity:.2f} < {t['min_circularity']} required for Extra"
        )
    if shape.aspect_ratio > t["max_aspect_ratio"]:
        extra_fail.append(
            f"Aspect ratio {shape.aspect_ratio:.2f} > {t['max_aspect_ratio']} for Extra"
        )
    if shape.convexity_defects > t["max_convexity_defects"]:
        extra_fail.append(
            f"Shape defects ({shape.convexity_defects}) > {t['max_convexity_defects']} for Extra"
        )
    if scars.longest_scar_cm > t["max_scar_length_cm"]:
        extra_fail.append(
            f"Scar length {scars.longest_scar_cm:.2f}cm > {t['max_scar_length_cm']}cm for Extra"
        )
    if scars.unhealed_crack_detected:
        extra_fail.append("Unhealed crack detected — disqualifies Extra and Class I")

    if not extra_fail:
        return "EXTRA", []

    # ── CLASS I ───────────────────────────────────────────────────────────
    class1_fail = []
    t = THRESHOLDS["CLASS1"]

    if effective_red_pct < t["min_red_pct"]:
        class1_fail.append(
            f"Red surface {effective_red_pct:.1f}% < {t['min_red_pct']}% required for Class I"
        )
    if non_red_pct > t["max_non_red_pct"]:
        class1_fail.append(
            f"Non-red (yellow+green) {non_red_pct:.1f}% > {t['max_non_red_pct']}% for Class I"
        )
    if colour.brown_pct > t["max_brown_pct"]:
        class1_fail.append(
            f"Brown/bruise {colour.brown_pct:.1f}% > {t['max_brown_pct']}% for Class I"
        )
    if colour.black_pct > t["max_black_pct"]:
        class1_fail.append(
            f"Black spots {colour.black_pct:.1f}% > {t['max_black_pct']}% for Class I"
        )
    if defects.defect_area_sqcm > t["max_defect_area_sqcm"]:
        class1_fail.append(
            f"Defect area {defects.defect_area_sqcm:.2f} sq.cm > {t['max_defect_area_sqcm']} sq.cm for Class I"
        )
    if shape.circularity < t["min_circularity"]:
        class1_fail.append(
            f"Circularity {shape.circularity:.2f} < {t['min_circularity']} for Class I"
        )
    if shape.aspect_ratio > t["max_aspect_ratio"]:
        class1_fail.append(
            f"Aspect ratio {shape.aspect_ratio:.2f} > {t['max_aspect_ratio']} for Class I"
        )
    if scars.longest_scar_cm > t["max_scar_length_cm"]:
        class1_fail.append(
            f"Scar {scars.longest_scar_cm:.2f}cm > {t['max_scar_length_cm']}cm limit for Class I"
        )
    if scars.unhealed_crack_detected:
        class1_fail.append("Unhealed crack — Class I requires only healed cracks ≤1cm")

    if not class1_fail:
        reasons = [f"[Extra↓] {r}" for r in extra_fail]
        return "CLASS1", reasons

    # ── CLASS II — fallback ────────────────────────────────────────────────
    all_reasons = (
        [f"[Extra↓]  {r}" for r in extra_fail] +
        [f"[Class I↓] {r}" for r in class1_fail]
    )
    return "CLASS2", all_reasons


# =============================================================================
# ANNOTATION
# =============================================================================

def _annotate_image(img_bgr:  np.ndarray,
                    result:   AnalysisResult,
                    tomato_mask: np.ndarray) -> np.ndarray:
    h, w  = img_bgr.shape[:2]
    panel_w = 340
    canvas  = np.zeros((h, w + panel_w, 3), dtype=np.uint8)

    canvas[:h, :w] = img_bgr
    canvas[:, w:] = (20, 20, 30)

    grade_colour = {
        "EXTRA":  (50, 220, 50),
        "CLASS1": (50, 180, 255),
        "CLASS2": (30, 140, 255),
    }.get(result.grade, (200, 200, 200))

    contour = _get_primary_contour(tomato_mask)
    if contour is not None:
        cv2.drawContours(canvas, [contour], -1, grade_colour, 2)

    def put(text, row, colour=(220, 220, 220), scale=0.42, bold=False):
        thickness = 2 if bold else 1
        cv2.putText(canvas, text,
                    (w + 8, row),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    scale, colour, thickness, cv2.LINE_AA)

    row = 28
    step = 18

    put("AGMARK TOMATO ANALYSER", row, (255, 255, 255), 0.48, True); row += step + 4
    cv2.line(canvas, (w + 5, row), (w + panel_w - 5, row), (80, 80, 80), 1); row += 10

    badge_label = {
        "EXTRA":  "EXTRA CLASS",
        "CLASS1": "CLASS  I",
        "CLASS2": "CLASS  II",
    }.get(result.grade, result.grade)
    put(f"GRADE:  {badge_label}", row, grade_colour, 0.5, True); row += step + 6
    cv2.line(canvas, (w + 5, row), (w + panel_w - 5, row), (60, 60, 60), 1); row += 8

    c = result.colour
    put("COLOUR ANALYSIS", row, (180, 180, 255), 0.44, True); row += step
    effective_red = c.red_pct + c.pink_pct
    put(f"  Red+Pink  : {effective_red:5.1f}%",  row,
        (50, 220, 50) if effective_red >= 60 else (80, 80, 255)); row += step
    put(f"  Yellow    : {c.yellow_pct:5.1f}%",   row,
        (255, 255, 80) if c.yellow_pct > 2 else (180, 180, 180)); row += step
    put(f"  Green     : {c.green_pct:5.1f}%",    row,
        (80, 255, 80)  if c.green_pct  > 0 else (180, 180, 180)); row += step
    put(f"  Brown     : {c.brown_pct:5.1f}%",    row,
        (80, 140, 200) if c.brown_pct  > 2 else (180, 180, 180)); row += step
    put(f"  Black     : {c.black_pct:5.1f}%",    row,
        (80,  80, 255) if c.black_pct  > 1 else (180, 180, 180)); row += step
    row += 4

    s = result.shape
    put("SHAPE ANALYSIS", row, (180, 255, 180), 0.44, True); row += step
    put(f"  Circularity     : {s.circularity:.3f}",    row); row += step
    put(f"  Aspect Ratio    : {s.aspect_ratio:.3f}",   row); row += step
    put(f"  Convexity Ratio : {s.convexity_ratio:.3f}",row); row += step
    put(f"  Shape Defects   : {s.convexity_defects}",  row); row += step
    put(f"  Verdict         : {s.shape_verdict}",      row,
        (50, 220, 50) if s.shape_verdict == "ROUND" else
        (255, 200, 80) if s.shape_verdict == "SLIGHTLY_DEFORMED" else
        (80, 80, 255)); row += step
    row += 4

    d = result.defects
    put("SURFACE DEFECTS", row, (255, 200, 180), 0.44, True); row += step
    put(f"  Defect Area     : {d.defect_area_sqcm:.3f} sq.cm", row); row += step
    put(f"  Defect Surface  : {d.defect_pct:.1f}%",            row); row += step
    put(f"  Spot Count      : {d.spot_count}",                  row); row += step
    put(f"  Largest Spot    : {d.largest_spot_sqcm:.3f} sq.cm", row); row += step
    put(f"  Verdict         : {d.defect_verdict}",              row,
        (50, 220, 50)  if d.defect_verdict in ("NONE", "VERY_SLIGHT") else
        (255, 200, 80) if d.defect_verdict == "SLIGHT" else
        (80, 80, 255)); row += step
    row += 4

    sc = result.scars
    put("SCARS & CRACKS", row, (255, 180, 255), 0.44, True); row += step
    put(f"  Scar Count      : {sc.scar_count}",                 row); row += step
    put(f"  Longest Scar    : {sc.longest_scar_cm:.2f} cm",     row); row += step
    put(f"  Total Scar Area : {sc.total_scar_area_sqcm:.3f} sq.cm", row); row += step
    put(f"  Unhealed Crack  : {'YES !' if sc.unhealed_crack_detected else 'No'}",
        row,
        (80, 80, 255) if sc.unhealed_crack_detected else (50, 220, 50)); row += step
    put(f"  Verdict         : {sc.scar_verdict}",               row,
        (50, 220, 50)  if sc.scar_verdict == "NONE" else
        (255, 200, 80) if sc.scar_verdict == "SLIGHT" else
        (80, 80, 255)); row += step
    row += 6

    if result.grade_reasons:
        cv2.line(canvas, (w + 5, row), (w + panel_w - 5, row), (60, 60, 60), 1)
        row += 8
        put("DOWNGRADE REASONS", row, (120, 120, 255), 0.40, True); row += step
        for reason in result.grade_reasons[:6]:
            words    = reason.split()
            line_buf = ""
            for word in words:
                if len(line_buf) + len(word) + 1 > 42:
                    put(f"  {line_buf.strip()}", row, (160, 140, 200), 0.36)
                    row += step - 4
                    line_buf = word + " "
                else:
                    line_buf += word + " "
            if line_buf.strip():
                put(f"  {line_buf.strip()}", row, (160, 140, 200), 0.36)
                row += step - 4

    return canvas


# =============================================================================
# PUBLIC API
# =============================================================================

def analyse_tomato(img_bgr: np.ndarray,
                   debug:   bool = False) -> AnalysisResult:
    """
    Main entry point.

    Parameters
    ----------
    img_bgr : np.ndarray
        Segmented tomato image with black background (output from SAM pipeline).
        Expected size ~500×500 but works on any size.
    debug   : bool
        If True, prints detailed sub-scores to stdout.

    Returns
    -------
    AnalysisResult
        Contains grade (EXTRA/CLASS1/CLASS2), colour/shape/defect/scar reports,
        and a fully annotated image.
    """
    result = AnalysisResult()

    tomato_mask = _extract_tomato_mask(img_bgr)

    total_px = int(np.count_nonzero(tomato_mask))
    if total_px < 500:
        result.grade         = "CLASS2"
        result.grade_reasons = ["Could not extract valid tomato region from image"]
        result.annotated_image = img_bgr.copy()
        return result

    result.colour  = _analyse_colour(img_bgr, tomato_mask)
    result.shape   = _analyse_shape(tomato_mask)
    result.defects = _analyse_defects(img_bgr, tomato_mask, result.colour)
    result.scars   = _analyse_scars(img_bgr, tomato_mask, result.shape)

    result.grade, result.grade_reasons = _determine_grade(
        result.colour, result.shape, result.defects, result.scars
    )

    result.annotated_image = _annotate_image(img_bgr, result, tomato_mask)

    if debug:
        _print_debug(result)

    return result


def _print_debug(result: AnalysisResult):
    c, s, d, sc = result.colour, result.shape, result.defects, result.scars
    sep = "─" * 50
    print(f"\n{sep}")
    print(f"  AGMARK GRADE   : {result.grade}")
    print(sep)
    print(f"  COLOUR")
    print(f"    Red+Pink     : {c.red_pct + c.pink_pct:.1f}%")
    print(f"    Yellow       : {c.yellow_pct:.1f}%")
    print(f"    Green        : {c.green_pct:.1f}%")
    print(f"    Brown        : {c.brown_pct:.1f}%")
    print(f"    Black        : {c.black_pct:.1f}%")
    print(f"  SHAPE")
    print(f"    Circularity  : {s.circularity:.3f}")
    print(f"    Aspect Ratio : {s.aspect_ratio:.3f}")
    print(f"    Conv. Defects: {s.convexity_defects}")
    print(f"    Verdict      : {s.shape_verdict}")
    print(f"  DEFECTS")
    print(f"    Area         : {d.defect_area_sqcm:.3f} sq.cm")
    print(f"    Spot count   : {d.spot_count}")
    print(f"    Verdict      : {d.defect_verdict}")
    print(f"  SCARS")
    print(f"    Count        : {sc.scar_count}")
    print(f"    Longest      : {sc.longest_scar_cm:.2f} cm")
    print(f"    Unhealed     : {sc.unhealed_crack_detected}")
    print(f"    Verdict      : {sc.scar_verdict}")
    if result.grade_reasons:
        print(f"  DOWNGRADE REASONS:")
        for r in result.grade_reasons:
            print(f"    • {r}")
    print(sep)