import cv2
import numpy as np
import os
import json
from typing import Dict, Tuple, Optional

# =============================================================================
# CONFIGURATION
# =============================================================================

INPUT_FOLDER  = "inputer"
OUTPUT_FOLDER = "output/graded"
REPORT_FILE   = "output/grading_report.json"

VALID_EXT = (".jpg", ".jpeg", ".png", ".bmp")

# =============================================================================
# THRESHOLDS
# =============================================================================

CIRC_EXTRA  = 0.82
CIRC_CLASS1 = 0.70
CIRC_CLASS2 = 0.55

BACKS_EXTRA  = 8.0
BACKS_CLASS1 = 10.0
BACKS_CLASS2 = 20.0

DEFECT_EXTRA  = 0.0
DEFECT_CLASS1 = 10.0
DEFECT_CLASS2 = 20.0

SCAR_EXTRA  = 0.0
SCAR_CLASS1 = 10.0
SCAR_CLASS2 = 20.0

MIN_CONTOUR_AREA = 3000

# =============================================================================
# HSV RANGES
# =============================================================================

BODY_RANGES = [
    ((0, 40, 40), (10, 255, 255)),
    ((160, 40, 40), (180, 255, 255)),
    ((10, 40, 40), (20, 255, 255)),
    ((20, 30, 30), (33, 255, 255)),
    ((33, 25, 25), (90, 255, 255)),
]

RED_RANGES = [
    ((0, 50, 40), (10, 255, 255)),
    ((160, 50, 40), (180, 255, 255)),
    ((0, 20, 10), (10, 120, 80)),
    ((160, 20, 10), (180, 120, 80)),
]

NONRED_RANGES = [
    ((10, 50, 40), (20, 255, 255)),
    ((20, 40, 40), (33, 255, 255)),
    ((33, 30, 25), (90, 255, 255)),
]

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def create_mask(hsv: np.ndarray, ranges) -> np.ndarray:
    mask = np.zeros(hsv.shape[:2], dtype=np.uint8)
    for lower, upper in ranges:
        mask |= cv2.inRange(hsv, np.array(lower), np.array(upper))
    return mask

def clean_mask(mask: np.ndarray, kernel_size=17) -> np.ndarray:
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k)
    return mask

# =============================================================================
# STEP 1 — TOMATO MASK
# =============================================================================

def build_tomato_mask(hsv: np.ndarray) -> np.ndarray:
    mask = create_mask(hsv, BODY_RANGES)
    return clean_mask(mask)

# =============================================================================
# STEP 2 — COLOUR
# =============================================================================

def check_colour(hsv, tomato_mask) -> Dict:
    red_mask = create_mask(hsv, RED_RANGES)
    nonred_mask = create_mask(hsv, NONRED_RANGES)

    red_mask = cv2.bitwise_and(red_mask, red_mask, mask=tomato_mask)
    nonred_mask = cv2.bitwise_and(nonred_mask, nonred_mask, mask=tomato_mask)

    total = max(np.count_nonzero(tomato_mask), 1)

    red_pct = np.count_nonzero(red_mask) / total * 100
    nonred_pct = np.count_nonzero(nonred_mask) / total * 100

    if nonred_pct <= BACKS_EXTRA:
        grade = "Extra Class"
    elif nonred_pct <= BACKS_CLASS1:
        grade = "Class 1"
    elif nonred_pct <= BACKS_CLASS2:
        grade = "Class 2"
    else:
        grade = "Rejected"

    return {
        "red_pct": red_pct,
        "nonred_pct": nonred_pct,
        "colour_grade": grade,
        "nonred_mask": nonred_mask
    }

# =============================================================================
# STEP 3 — SHAPE
# =============================================================================

def check_shape(mask) -> Dict:
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return {"shape_grade": "Rejected", "circularity": 0, "contour": None}

    c = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(c)

    if area < MIN_CONTOUR_AREA:
        return {"shape_grade": "Rejected", "circularity": 0, "contour": None}

    peri = cv2.arcLength(c, True)
    circ = (4 * np.pi * area) / (peri ** 2) if peri > 0 else 0

    if circ >= CIRC_EXTRA:
        grade = "Extra Class"
    elif circ >= CIRC_CLASS1:
        grade = "Class 1"
    elif circ >= CIRC_CLASS2:
        grade = "Class 2"
    else:
        grade = "Rejected"

    return {"shape_grade": grade, "circularity": circ, "contour": c}

# =============================================================================
# STEP 4 — DEFECTS
# =============================================================================

def check_defects(img, mask):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)

    mean = cv2.mean(lab, mask=mask)
    diff = np.sqrt(
        (lab[:,:,0]-mean[0])**2 +
        (lab[:,:,1]-mean[1])**2 +
        (lab[:,:,2]-mean[2])**2
    )

    defect_mask = ((diff > 35) & (mask > 0)).astype(np.uint8) * 255

    total = max(np.count_nonzero(mask), 1)
    pct = np.count_nonzero(defect_mask) / total * 100

    if pct <= DEFECT_EXTRA:
        grade = "Extra Class"
    elif pct <= DEFECT_CLASS1:
        grade = "Class 1"
    elif pct <= DEFECT_CLASS2:
        grade = "Class 2"
    else:
        grade = "Rejected"

    return {"defect_pct": pct, "defect_grade": grade, "defect_mask": defect_mask}

# =============================================================================
# STEP 5 — SCARS
# =============================================================================

def check_scars(img, mask):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    mean = cv2.mean(gray, mask=mask)[0]
    _, dark = cv2.threshold(gray, int(mean * 0.6), 255, cv2.THRESH_BINARY_INV)

    dark = cv2.bitwise_and(dark, dark, mask=mask)

    edges = cv2.Canny(gray, 40, 120)
    edges = cv2.bitwise_and(edges, edges, mask=mask)

    scar_mask = cv2.bitwise_and(dark, edges)

    total = max(np.count_nonzero(mask), 1)
    pct = np.count_nonzero(scar_mask) / total * 100

    if pct <= SCAR_EXTRA:
        grade = "Extra Class"
    elif pct <= SCAR_CLASS1:
        grade = "Class 1"
    elif pct <= SCAR_CLASS2:
        grade = "Class 2"
    else:
        grade = "Rejected"

    return {"scar_pct": pct, "scar_grade": grade, "scar_mask": scar_mask}

# =============================================================================
# FINAL GRADE
# =============================================================================

GRADE_ORDER = ["Extra Class", "Class 1", "Class 2", "Rejected"]

def final_grade(*grades):
    return max(grades, key=lambda g: GRADE_ORDER.index(g))

# =============================================================================
# MAIN GRADING FUNCTION (FOR PIPELINE)
# =============================================================================

def grade_tomato_from_array(img: np.ndarray) -> Optional[Tuple[str, np.ndarray]]:

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    mask = build_tomato_mask(hsv)

    if np.count_nonzero(mask) < MIN_CONTOUR_AREA:
        return None

    c = check_colour(hsv, mask)
    s = check_shape(mask)
    d = check_defects(img, mask)
    sc = check_scars(img, mask)

    grade = final_grade(
        c["colour_grade"],
        s["shape_grade"],
        d["defect_grade"],
        sc["scar_grade"]
    )

    annotated = img.copy()
    cv2.putText(annotated, grade, (10,30),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0,255,0), 2)

    return grade, annotated

# =============================================================================
# MAIN LOOP
# =============================================================================

if __name__ == "__main__":

    os.makedirs(OUTPUT_FOLDER, exist_ok=True)

    results = []

    for file in os.listdir(INPUT_FOLDER):

        if not file.lower().endswith(VALID_EXT):
            continue

        path = os.path.join(INPUT_FOLDER, file)
        img = cv2.imread(path)

        if img is None:
            continue

        res = grade_tomato_from_array(img)

        if res is None:
            continue

        grade, annotated = res

        cv2.imwrite(os.path.join(OUTPUT_FOLDER, file), annotated)

        results.append({
            "file": file,
            "grade": grade
        })

    with open(REPORT_FILE, "w") as f:
        json.dump(results, f, indent=2)

    print("Grading complete.")  