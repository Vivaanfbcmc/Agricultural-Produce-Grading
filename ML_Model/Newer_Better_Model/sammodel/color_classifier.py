import cv2
import numpy as np

# ---------------------------------------------------------------------------
# HSV Color Range Definitions
# Each entry: (label, hex_representative, [(h_low, s_low, v_low, h_high, s_high, v_high), ...])
# OpenCV HSV: H in [0,179], S in [0,255], V in [0,255]
#
# Red wraps around 0/180 in HSV so it needs TWO ranges.
# ---------------------------------------------------------------------------

COLOR_RANGES = [
    {
        "label": "Red (Bright)",
        "hex": "#FF2200",
        "ranges": [
            (0,   150, 100, 10,  255, 255),   # lower red
            (170, 150, 100, 179, 255, 255),   # upper red
        ],
    },
    {
        "label": "Red (Dark/Dull)",
        "hex": "#8B1A0A",
        "ranges": [
            (0,   40, 40, 10,  149, 180),
            (170, 40, 40, 179, 149, 180),
        ],
    },
    {
        "label": "Orange",
        "hex": "#FF6600",
        "ranges": [
            (10, 120, 100, 22, 255, 255),
        ],
    },
    {
        "label": "Yellow",
        "hex": "#FFD700",
        "ranges": [
            (22, 80, 100, 38, 255, 255),
        ],
    },
    {
        "label": "Green (Unripe)",
        "hex": "#4CAF50",
        "ranges": [
            (38, 60, 60, 85, 255, 255),
        ],
    },
    {
        "label": "Brown/Dark",
        "hex": "#4A2000",
        "ranges": [
            (0, 30, 10, 20, 150, 80),
        ],
    },
]


def classify_pixels(image_bgr, binary_mask):
    """
    Given the original BGR image and a binary mask (0 or 255),
    classify every masked pixel into one of the color buckets.

    Returns a list of dicts:
        [{ label, hex, count, percentage }, ...]
    sorted by percentage descending, with an 'Other' bucket for anything unmatched.
    """
    # Convert to HSV
    image_hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)

    # Apply mask — only keep pixels inside the tomato
    mask_bool = binary_mask > 0
    total_pixels = int(np.sum(mask_bool))

    if total_pixels == 0:
        raise ValueError("Mask is empty — no pixels to classify.")

    print(f"[Color] Total masked pixels: {total_pixels}")

    hsv_masked = image_hsv[mask_bool]  # shape: (N, 3)

    results = []
    accounted = np.zeros(total_pixels, dtype=bool)

    for color in COLOR_RANGES:
        combined = np.zeros(total_pixels, dtype=bool)

        for (h_lo, s_lo, v_lo, h_hi, s_hi, v_hi) in color["ranges"]:
            lo = np.array([h_lo, s_lo, v_lo])
            hi = np.array([h_hi, s_hi, v_hi])
            in_range = np.all((hsv_masked >= lo) & (hsv_masked <= hi), axis=1)
            combined |= in_range

        # Don't double-count pixels already matched
        new_pixels = combined & ~accounted
        accounted |= new_pixels
        count = int(np.sum(new_pixels))

        results.append({
            "label": color["label"],
            "hex": color["hex"],
            "count": count,
            "percentage": round(count / total_pixels * 100, 2),
        })

    # Anything not matched goes to "Other"
    other_count = int(np.sum(~accounted))
    results.append({
        "label": "Other",
        "hex": "#888888",
        "count": other_count,
        "percentage": round(other_count / total_pixels * 100, 2),
    })

    results.sort(key=lambda x: x["percentage"], reverse=True)
    return results, total_pixels