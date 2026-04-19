import cv2
import numpy as np
import os
import glob
from ultralytics import YOLO

# ============================================================
# CONFIG
# ============================================================
YOLO_COIN_PATH       = r"D:\COLLEGE STUFF\sem7\Final_Year_project_final_ML_\CoinDetection\Coin_Detection-main\Coin_Detection-main\best.pt"

COIN_REAL_DIAMETER_MM = 22.0          # known real-world coin diameter in mm
COIN_CONF_THRESHOLD   = 0.2          # lower = more detections, higher = stricter

INPUT_FOLDER    = "input_images"
OUTPUT_FOLDER   = "coin_output"
CROP_FOLDER     = "Detected_Images"

VALID_EXT = (".jpg", ".jpeg", ".png", ".bmp")

# ============================================================
# COLOR FILTER — keep only silver/gold looking regions
# ============================================================
def is_coin_color(img_bgr, x1, y1, x2, y2, min_coin_ratio=0.25):
    """
    Returns True if the bounding-box region looks like a coin
    (silver or gold), False otherwise (e.g. red tomato).

    Strategy: convert to HSV and check what fraction of pixels
    fall inside silver or gold HSV ranges.
    """
    crop = img_bgr[y1:y2, x1:x2]
    if crop.size == 0:
        return False

    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)

    # ── Silver: low saturation, medium-high value ──────────────
    # (greyish/whites — most Indian/common coins)
    silver_mask = cv2.inRange(hsv,
                              np.array([0,   0, 100]),
                              np.array([180, 55, 255]))

    # ── Gold / Brass: yellowish hue, moderate saturation ──────
    gold_mask = cv2.inRange(hsv,
                            np.array([15,  40,  80]),
                            np.array([40, 220, 255]))

    coin_pixels  = cv2.countNonZero(silver_mask) + cv2.countNonZero(gold_mask)
    total_pixels = crop.shape[0] * crop.shape[1]

    ratio = coin_pixels / total_pixels if total_pixels > 0 else 0
    return ratio >= min_coin_ratio


# ============================================================
# LOAD YOLO MODEL
# ============================================================
print("[INFO] Loading YOLO coin detection model...")
yolo_model = YOLO(YOLO_COIN_PATH)
print(f"[INFO] Model loaded. Classes: {yolo_model.names}")

# ============================================================
# SETUP FOLDERS
# ============================================================
os.makedirs(INPUT_FOLDER,  exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
os.makedirs(CROP_FOLDER,   exist_ok=True)

# Clear old crops
for f in glob.glob(os.path.join(CROP_FOLDER, "*")):
    os.remove(f)


# ============================================================
# CROP & SAVE COIN
# ============================================================
def crop_and_save_coin(img_bgr, x_center, y_center, radius, coin_idx):
    """Crop a circular region around the detected coin and save it."""
    h, w = img_bgr.shape[:2]

    y1 = max(0, int(y_center - radius))
    y2 = min(h, int(y_center + radius))
    x1 = max(0, int(x_center - radius))
    x2 = min(w, int(x_center + radius))

    crop = img_bgr[y1:y2, x1:x2].copy()
    if crop.size == 0:
        return False

    # Apply circular mask so background is black
    gray_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    mask      = np.zeros_like(gray_crop)
    cy, cx    = mask.shape[0] // 2, mask.shape[1] // 2
    r         = min(cx, cy)
    cv2.circle(mask, (cx, cy), r, 255, -1)
    final = cv2.bitwise_and(gray_crop, gray_crop, mask=mask)

    save_path = os.path.join(CROP_FOLDER, f"{coin_idx}.jpg")
    cv2.imwrite(save_path, final)
    return True


# ============================================================
# DETECT COINS IN ONE IMAGE
# ============================================================
def detect_coins(img_bgr, img_name):
    """
    Run YOLO on the image, extract coin detections, compute
    pixel diameter and px/cm scale for each coin.

    Returns annotated image and list of result dicts.
    """
    annotated = img_bgr.copy()
    h, w      = img_bgr.shape[:2]

    results = yolo_model(img_bgr, verbose=False)[0]
    boxes   = results.boxes

    if boxes is None or len(boxes) == 0:
        print(f"  No coins detected in {img_name}")
        return annotated, []

    coin_data = []
    coin_idx  = 0

    for box in boxes:
        conf     = float(box.conf[0])
        cls_id   = int(box.cls[0])
        cls_name = yolo_model.names[cls_id].lower()

        if conf < COIN_CONF_THRESHOLD:
            continue

        # ── Bounding box ──────────────────────────────────────
        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)

        # ── COLOR FILTER ──────────────────────────────────────
        # Skip anything that doesn't look silver or gold (e.g. tomatoes)
        if not is_coin_color(img_bgr, x1, y1, x2, y2):
            print(f"  [SKIP] Rejected non-coin color at ({x1},{y1})->({x2},{y2})  class='{cls_name}'  conf={conf:.2f}")
            continue

        box_w = x2 - x1
        box_h = y2 - y1

        # Diameter = average of bbox width and height
        # (coins are round so these should be close; averaging is robust)
        pixel_diameter = (box_w + box_h) / 2.0
        pixel_radius   = pixel_diameter / 2.0

        x_center = (x1 + x2) / 2.0
        y_center = (y1 + y2) / 2.0

        # ── Scale calculation ──────────────────────────────────
        # Reference: COIN_REAL_DIAMETER_MM mm = pixel_diameter px
        # So:  px_per_mm = pixel_diameter / COIN_REAL_DIAMETER_MM
        #      px_per_cm = px_per_mm * 10
        px_per_mm = pixel_diameter / COIN_REAL_DIAMETER_MM
        px_per_cm = px_per_mm * 10.0
        mm_per_px = 1.0 / px_per_mm

        coin_idx += 1
        print(f"  Coin #{coin_idx}  class='{cls_name}'  conf={conf:.2f}")
        print(f"    BBox      : ({x1},{y1}) -> ({x2},{y2})")
        print(f"    Pixel dia : {pixel_diameter:.1f} px")
        print(f"    Scale     : {px_per_cm:.2f} px/cm  |  {mm_per_px:.3f} mm/px")

        coin_data.append({
            "id":             coin_idx,
            "class":          cls_name,
            "confidence":     conf,
            "bbox":           (x1, y1, x2, y2),
            "pixel_diameter": pixel_diameter,
            "px_per_mm":      px_per_mm,
            "px_per_cm":      px_per_cm,
            "mm_per_px":      mm_per_px,
        })

        # ── Crop & save ───────────────────────────────────────
        crop_and_save_coin(img_bgr, x_center, y_center, pixel_radius, coin_idx)

        # ── Draw on annotated image ───────────────────────────
        # Green circle
        cv2.circle(annotated,
                   (int(x_center), int(y_center)),
                   int(pixel_radius),
                   (0, 255, 0), 2)

        # Centre dot
        cv2.circle(annotated, (int(x_center), int(y_center)), 4, (255, 0, 0), -1)

        # Horizontal diameter line (yellow)
        cv2.line(annotated,
                 (int(x_center - pixel_radius), int(y_center)),
                 (int(x_center + pixel_radius), int(y_center)),
                 (0, 255, 255), 2)

        # Label above coin
        label = (f"#{coin_idx} {cls_name} | "
                 f"D={pixel_diameter:.0f}px | "
                 f"{px_per_cm:.1f}px/cm")
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        label_y = max(int(y_center - pixel_radius) - 8, th + 4)
        cv2.rectangle(annotated,
                      (int(x_center - pixel_radius), label_y - th - 4),
                      (int(x_center - pixel_radius) + tw + 6, label_y),
                      (0, 0, 0), -1)
        cv2.putText(annotated, label,
                    (int(x_center - pixel_radius) + 3, label_y - 2),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1, cv2.LINE_AA)

    return annotated, coin_data


# ============================================================
# SUMMARY TABLE
# ============================================================
def print_summary(coin_data, img_name):
    if not coin_data:
        return
    print(f"\n  +-- Scale Summary: {img_name}")
    print(f"  |   Reference coin = {COIN_REAL_DIAMETER_MM} mm")
    print(f"  +{'-'*50}")
    print(f"  |  {'#':<4} {'Class':<12} {'Dia(px)':>9} {'px/cm':>8} {'mm/px':>8}")
    print(f"  +{'-'*50}")
    for c in coin_data:
        print(f"  |  {c['id']:<4} {c['class']:<12} "
              f"{c['pixel_diameter']:>9.1f} "
              f"{c['px_per_cm']:>8.2f} "
              f"{c['mm_per_px']:>8.4f}")
    avg_px_per_cm = np.mean([c["px_per_cm"] for c in coin_data])
    print(f"  +{'-'*50}")
    print(f"  |  Average scale : {avg_px_per_cm:.2f} px/cm")
    print(f"  +{'-'*50}\n")
    return avg_px_per_cm


# ============================================================
# MAIN LOOP
# ============================================================
image_paths = [
    p for p in glob.glob(os.path.join(INPUT_FOLDER, "*"))
    if p.lower().endswith(VALID_EXT)
]

if not image_paths:
    print(f"No images found in '{INPUT_FOLDER}/'")
    exit()

print(f"\n[INFO] Processing {len(image_paths)} image(s)...\n")

last_result = None

for img_path in sorted(image_paths):
    img_name = os.path.basename(img_path)
    img      = cv2.imread(img_path)

    if img is None:
        print(f"[WARN] Could not read: {img_path}")
        continue

    print(f"{'='*55}")
    print(f"  Image : {img_name}")

    annotated, coin_data = detect_coins(img, img_name)

    if coin_data:
        print_summary(coin_data, img_name)

    out_path = os.path.join(OUTPUT_FOLDER, img_name)
    cv2.imwrite(out_path, annotated)
    print(f"  Saved -> {out_path}")

    last_result = annotated

print(f"\n{'='*55}")
print(f"Done!  Crops -> {CROP_FOLDER}/   Output -> {OUTPUT_FOLDER}/")
print(f"{'='*55}")

if last_result is not None:
    cv2.imshow("Coin Detection", last_result)
    cv2.waitKey(0)
    cv2.destroyAllWindows()