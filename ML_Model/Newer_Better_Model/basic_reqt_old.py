import cv2
import numpy as np
import torch
import torch.nn as nn
import os
from ultralytics import YOLO
from tensorflow.keras.models import load_model
from torchvision import models as tv_models, transforms
from PIL import Image
from tomatoGRader import grade_tomato_from_array
from segment_anything import sam_model_registry, SamAutomaticMaskGenerator
from tomatoAnalyzer import analyse_tomato

# =============================================================================
# CONFIG
# =============================================================================
YOLO_DETECT_PATH  = r"D:\COLLEGE STUFF\sem7\Final_Year_project_final_ML_\Basic_Requirement_Integration1\Tomato_Detection_1\runs\classify\runs\classify\tomato_binary_balanced_e60\weights\best.pt"
YOLO_BBOX_PATH    = r"D:\COLLEGE STUFF\sem7\Final_Year_project_final_ML_\Tomato_BoundingBoxes\runs\detect\train\weights\best.pt"
FRESH_MODEL_PATH  = r"Basic_Requirement_Integration1\rotten_fres\rotten_fresh_mobilenet_pytorch.pth"
PEST_MODEL_PATH   = r"Basic_Requirement_Integration1\Pest_classifier\pest_classifier.h5"
CUT_MODEL_PATH    = r"Basic_Requirement_Integration1\Cut_notCut_model1\CutNotCutModel.pth"
SAM_CHECKPOINT    = r"sammodel\checkpoints\sam_vit_b_01ec64.pth"
SAM_MODEL_TYPE    = "vit_b"

INPUT_FOLDER     = "inputer"
GOOD_FOLDER      = "output/good"
BAD_FOLDER       = "output/bad"
ANNOTATED_FOLDER = "output/annotated"
GRADED_FOLDER    = "output/graded"

TOMATO_CONF_THRESHOLD = 0.5
BBOX_CONF_THRESHOLD   = 0.3
FRESH_CONF_THRESHOLD  = 0.6
PEST_CONF_THRESHOLD   = 0.7
CUT_CONF_THRESHOLD    = 0.6

# FIX (Bug 3): SAM_RESIZE is now the TARGET SIZE for the longest side only.
# The image is letterboxed (padded with black) to this square size, not
# stretched. This preserves the tomato's true aspect ratio so that
# circularity and aspect-ratio measurements in tomatoAnalyzer are accurate.
SAM_RESIZE = 500

VALID_EXT = (".jpg", ".jpeg", ".png", ".bmp")

# =============================================================================
# DEVICE
# =============================================================================
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"[INFO] Using device: {device}")

# =============================================================================
# LOAD MODELS
# =============================================================================
print("[INFO] Loading models...")

yolo_model = YOLO(YOLO_DETECT_PATH)
print(f"[INFO] YOLO classify names: {yolo_model.names}")

yolo_bbox_model = YOLO(YOLO_BBOX_PATH)
print(f"[INFO] YOLO bbox names: {yolo_bbox_model.names}")

# ── SAM ───────────────────────────────────────────────────────────────────────
# SAM (Segment Anything Model) IS used in this pipeline. It runs in
# segment_and_blackout() on every image that passes the YOLO + bbox steps.
# Its job: produce a pixel-accurate mask of the tomato → zero-out background.
# The resulting masked image (black background + tomato pixels) is what all
# downstream models (fresh/rotten, pest, cut, AGMARK analyser) receive.
print("[INFO] Loading SAM model...")
if not os.path.exists(SAM_CHECKPOINT):
    raise FileNotFoundError(
        f"SAM checkpoint not found at {os.path.abspath(SAM_CHECKPOINT)}. "
        f"Place sam_vit_b_01ec64.pth inside sammodel/checkpoints/"
    )
sam = sam_model_registry[SAM_MODEL_TYPE](checkpoint=SAM_CHECKPOINT)
sam.to(device=device)
sam_mask_generator = SamAutomaticMaskGenerator(
    model=sam,
    points_per_side=16,
    pred_iou_thresh=0.88,
    stability_score_thresh=0.95,
    crop_n_layers=0,
    min_mask_region_area=500,
)
print("[INFO] SAM loaded.")

fresh_checkpoint   = torch.load(FRESH_MODEL_PATH, map_location=device, weights_only=False)
fresh_class_to_idx = fresh_checkpoint.get("class_to_idx", {"fresh": 0, "rotten": 1})
fresh_idx_to_class = {v: k for k, v in fresh_class_to_idx.items()}

fresh_model = tv_models.mobilenet_v2(weights=None)
fresh_model.classifier = nn.Sequential(
    nn.Dropout(0.3),
    nn.Linear(fresh_model.last_channel, 128),
    nn.ReLU(),
    nn.Dropout(0.2),
    nn.Linear(128, 2)
)
fresh_model.load_state_dict(fresh_checkpoint["model_state_dict"])
fresh_model = fresh_model.to(device)
fresh_model.eval()
print(f"[INFO] Fresh/Rotten loaded. Classes: {fresh_class_to_idx}")

pest_model = load_model(PEST_MODEL_PATH)
print("[INFO] Pest model loaded.")

cut_model = tv_models.mobilenet_v2(weights=None)
cut_model.classifier = nn.Sequential(
    nn.Dropout(0.2),
    nn.Linear(cut_model.last_channel, 256),
    nn.ReLU(),
    nn.Dropout(0.2),
    nn.Linear(256, 2)
)
cut_model.load_state_dict(torch.load(CUT_MODEL_PATH, map_location=device, weights_only=True))
cut_model = cut_model.to(device)
cut_model.eval()
print("[INFO] Cut model loaded.")

print("[INFO] All models loaded.\n")

# =============================================================================
# OUTPUT FOLDERS
# =============================================================================
for folder in [GOOD_FOLDER, BAD_FOLDER, ANNOTATED_FOLDER, GRADED_FOLDER]:
    os.makedirs(folder, exist_ok=True)

# =============================================================================
# PREPROCESSING
# =============================================================================
fresh_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406],
                         [0.229, 0.224, 0.225])
])

def preprocess_fresh(img_bgr):
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(img_rgb)
    return fresh_transform(pil_img).unsqueeze(0).to(device)

def preprocess_tf(img_bgr):
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    img_rgb = cv2.resize(img_rgb, (224, 224)).astype(np.float32) / 255.0
    return np.expand_dims(img_rgb, axis=0)

def preprocess_torch(img_bgr):
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    img_rgb = cv2.resize(img_rgb, (224, 224)).astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406])
    std  = np.array([0.229, 0.224, 0.225])
    img_rgb = (img_rgb - mean) / std
    tensor  = torch.tensor(np.transpose(img_rgb, (2, 0, 1)), dtype=torch.float32)
    return tensor.unsqueeze(0).to(device)


# =============================================================================
# FIX (Bug 3): LETTERBOX RESIZE — preserve aspect ratio
# =============================================================================
def _resize_letterbox(img_bgr: np.ndarray, target: int) -> np.ndarray:
    """
    Resize img_bgr so its longest side = target, then pad to target×target
    with black borders.  This preserves the original aspect ratio.

    WHY THIS MATTERS:
    The original code used cv2.resize(img, (SAM_RESIZE, SAM_RESIZE)) which
    squashed non-square inputs (e.g. a 480×640 tomato photo) into a square,
    making the tomato appear taller or wider than it really is.  That
    distortion flowed into circularity and aspect-ratio measurements in
    tomatoAnalyzer, systematically biasing them away from the Extra/Class I
    thresholds.

    Letterboxing pads with black pixels instead — the SAM background is
    already black, so the padding is invisible and does not affect any
    downstream mask or colour analysis.
    """
    h, w   = img_bgr.shape[:2]
    scale  = target / max(h, w)
    new_w  = int(round(w * scale))
    new_h  = int(round(h * scale))

    resized = cv2.resize(img_bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)

    # Create black square canvas and paste the resized image centered
    canvas  = np.zeros((target, target, 3), dtype=np.uint8)
    y_off   = (target - new_h) // 2
    x_off   = (target - new_w) // 2
    canvas[y_off:y_off + new_h, x_off:x_off + new_w] = resized

    return canvas


# =============================================================================
# STEP 1 — TOMATO DETECTION (YOLO classify)
# =============================================================================
def is_tomato(img_bgr):
    results   = yolo_model(img_bgr, verbose=False)[0]
    probs     = results.probs
    top_class = yolo_model.names[int(probs.top1)].lower()
    top_conf  = float(probs.top1conf)

    print(f"  YOLO CLASSIFY  → '{top_class}' ({top_conf:.2f})")

    if top_class != "tomato" or top_conf < TOMATO_CONF_THRESHOLD:
        return None

    return img_bgr.copy()


# =============================================================================
# STEP 2 — YOLO BBOX → CROP + BLACK BACKGROUND
# =============================================================================
def bbox_blackout(img_bgr):
    h, w    = img_bgr.shape[:2]
    results = yolo_bbox_model(img_bgr, verbose=False)[0]

    if results.boxes is None or len(results.boxes) == 0:
        print("  BBOX           → No box found, using full image")
        return img_bgr.copy(), None

    best_idx        = int(torch.argmax(results.boxes.conf).item())
    conf            = float(results.boxes.conf[best_idx])

    if conf < BBOX_CONF_THRESHOLD:
        print(f"  BBOX           → Low confidence ({conf:.2f}), using full image")
        return img_bgr.copy(), None

    box             = results.boxes.xyxy[best_idx].cpu().numpy().astype(int)
    x1, y1, x2, y2 = box
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)

    print(f"  BBOX           → ({x1},{y1})→({x2},{y2})  conf: {conf:.2f}")

    black_bg                  = np.zeros_like(img_bgr)
    black_bg[y1:y2, x1:x2]   = img_bgr[y1:y2, x1:x2]

    return black_bg, (x1, y1, x2, y2)


# =============================================================================
# STEP 3 — LETTERBOX RESIZE → SAM SEGMENT → BLACK BACKGROUND
# =============================================================================
def _pick_best_mask(masks, image_center, h, w, image_hsv):
    """Score masks by saturation + circularity + centrality + size."""
    image_area = h * w
    scored     = []

    for m in masks:
        seg  = m["segmentation"]
        area = m["area"]

        if area < 500 or area > image_area * 0.95:
            continue

        mean_sat = float(image_hsv[:, :, 1][seg].mean())
        if mean_sat < 30:
            continue

        moments = cv2.moments(seg.astype(np.uint8))
        if moments["m00"] == 0:
            continue
        cx   = moments["m10"] / moments["m00"]
        cy   = moments["m01"] / moments["m00"]
        dist = np.linalg.norm(np.array([cx, cy]) - image_center) / np.linalg.norm([w, h])

        contours, _ = cv2.findContours(
            seg.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        if not contours:
            continue
        perimeter   = cv2.arcLength(contours[0], True)
        circularity = min((4 * np.pi * area / (perimeter ** 2)) if perimeter > 0 else 0, 1.0)

        sat_score  = mean_sat / 255.0
        size_score = min(area / image_area, 0.5) * 2
        score      = (sat_score * 0.50) + (circularity * 0.25) + ((1 - dist) * 0.15) + (size_score * 0.10)
        scored.append((score, m))

    if not scored:
        print("  SAM            → All masks filtered, using most saturated fallback")
        return max(masks, key=lambda m: float(image_hsv[:, :, 1][m["segmentation"]].mean()))

    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[0][1]


def segment_and_blackout(img_bgr):
    """
    Receives the bbox-cropped black-background image.

    Pipeline:
      1. Letterbox-resize to SAM_RESIZE × SAM_RESIZE  ← FIX (Bug 3)
         (preserves aspect ratio, pads with black instead of stretching)
      2. Run SAM — generates pixel-accurate masks of the tomato
      3. Pick best mask (by saturation, circularity, centrality, size)
      4. Apply mask → background black, tomato original colour

    SAM note: SAM IS actively used here. It receives only the tomato + black
    surround (after YOLO bbox step), which greatly simplifies segmentation.
    The output is a tight, accurate tomato mask that all downstream steps use.
    """
    # FIX: use letterbox instead of plain resize to preserve aspect ratio
    resized      = _resize_letterbox(img_bgr, SAM_RESIZE)

    h, w         = resized.shape[:2]
    image_rgb    = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
    image_hsv    = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    image_center = np.array([w / 2, h / 2])

    masks = sam_mask_generator.generate(image_rgb)
    print(f"  SAM            → {len(masks)} segments found")

    if not masks:
        print("  SAM            → No segments found, using bbox result as-is")
        return resized

    best        = _pick_best_mask(masks, image_center, h, w, image_hsv)
    binary_mask = best["segmentation"].astype(np.uint8)
    print(f"  SAM            → Best mask area: {int(best['area'])} px")

    mask_3ch = np.stack([binary_mask, binary_mask, binary_mask], axis=2)
    result   = np.where(mask_3ch == 1, resized, 0)

    return result.astype(np.uint8)


# =============================================================================
# STEP 4 — FRESH / ROTTEN
# =============================================================================
def run_fresh_rotten(img_bgr):
    tensor = preprocess_fresh(img_bgr)

    with torch.no_grad():
        probs = torch.softmax(fresh_model(tensor), dim=1)[0]

    pred_idx   = int(torch.argmax(probs).item())
    confidence = float(probs[pred_idx].item())
    label      = fresh_idx_to_class[pred_idx]

    print(f"  FRESHNESS      → {label} ({confidence:.2f})")

    annotated = img_bgr.copy()
    h, w      = annotated.shape[:2]
    colour    = (0, 200, 0) if label == "fresh" else (0, 0, 220)

    cv2.rectangle(annotated, (0, 0), (w, 70), (25, 25, 25), -1)
    cv2.putText(annotated,
                f"Freshness: {label.upper()}  {confidence*100:.1f}%",
                (12, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.85, colour, 2, cv2.LINE_AA)
    prob_str = "  |  ".join([f"{fresh_idx_to_class[i]}: {probs[i]*100:.1f}%"
                              for i in range(len(probs))])
    cv2.putText(annotated, prob_str,
                (12, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 200), 1, cv2.LINE_AA)
    cv2.rectangle(annotated, (5, 5), (w - 5, h - 5), colour, 5)

    is_rotten = (label == "rotten" and confidence >= FRESH_CONF_THRESHOLD)
    return is_rotten, annotated


# =============================================================================
# STEP 5 — PEST
# =============================================================================
def has_pest(img_bgr):
    pest_pred = float(pest_model.predict(preprocess_tf(img_bgr), verbose=0)[0][0])
    print(f"  PEST           → {pest_pred:.2f}")
    return pest_pred > PEST_CONF_THRESHOLD


# =============================================================================
# STEP 6 — CUT
# =============================================================================
def is_cut(img_bgr):
    with torch.no_grad():
        probs     = torch.softmax(cut_model(preprocess_torch(img_bgr)), dim=1)
        cut_class = int(torch.argmax(probs, dim=1).item())
        cut_conf  = float(probs[0][cut_class].item())

    print(f"  CUT            → class {cut_class} ({cut_conf:.2f})")
    return cut_class == 0


# =============================================================================
# FULL PIPELINE
# =============================================================================
def check_tomato_quality(img_bgr, img_name):
    # 1 — Is it a tomato?
    tomato_img = is_tomato(img_bgr)
    if tomato_img is None:
        print("  RESULT         → REJECTED (NOT A TOMATO)")
        return "REJECTED", None, None

    # 2 — YOLO bbox → black out everything outside the box
    bbox_img, box_coords = bbox_blackout(tomato_img)
    if box_coords:
        x1, y1, x2, y2 = box_coords
        print(f"  BBOX           → Tomato isolated in bbox region")
    else:
        print("  BBOX           → No box, SAM will work on full image")

    # 3 — Letterbox resize → SAM segment → black background
    #     SAM produces a pixel-accurate tomato mask here.
    masked_img = segment_and_blackout(bbox_img)

    # 4 — Fresh or rotten?
    rotten, annotated = run_fresh_rotten(masked_img)
    if rotten:
        print("  RESULT         → REJECTED (ROTTEN)")
        return "REJECTED", annotated, masked_img

    # 5 — Pest?
    if has_pest(masked_img):
        print("  RESULT         → REJECTED (PEST)")
        return "REJECTED", annotated, masked_img

    # 6 — Cut?
    if is_cut(masked_img):
        print("  RESULT         → REJECTED (CUT)")
        return "REJECTED", annotated, masked_img

    print("  RESULT         → GOOD ✓")
    return "GOOD", annotated, masked_img


# =============================================================================
# MAIN LOOP
# =============================================================================
total = good = bad = failed = 0

for img_name in sorted(os.listdir(INPUT_FOLDER)):
    if not img_name.lower().endswith(VALID_EXT):
        continue

    total    += 1
    img_path  = os.path.join(INPUT_FOLDER, img_name)
    img       = cv2.imread(img_path)

    if img is None:
        print(f"[WARN] Could not load: {img_name}")
        failed += 1
        continue

    print(f"\n{'─'*45}")
    print(f"  Image: {img_name}")

    result, annotated, masked_img = check_tomato_quality(img, img_name)

    if annotated is not None and masked_img is not None:
        cv2.imwrite(os.path.join(ANNOTATED_FOLDER, img_name), annotated)

    if result == "GOOD":
        good += 1
        cv2.imwrite(os.path.join(GOOD_FOLDER, img_name), masked_img)

        analysis = analyse_tomato(masked_img, debug=True)
        print(f"  AGMARK GRADE   → {analysis.grade}")
        if analysis.grade_reasons:
            for reason in analysis.grade_reasons:
                print(f"                   {reason}")
        if analysis.annotated_image is not None:
            cv2.imwrite(os.path.join(GRADED_FOLDER, img_name), analysis.annotated_image)
    else:
        bad += 1
        save_img = masked_img if masked_img is not None else img
        cv2.imwrite(os.path.join(BAD_FOLDER, img_name), save_img)


# =============================================================================
# SUMMARY
# =============================================================================
print(f"\n{'='*45}")
print("  SUMMARY")
print(f"{'='*45}")
print(f"  Total          : {total}")
print(f"  Good           : {good}")
print(f"  Rejected       : {bad}")
print(f"  Failed to load : {failed}")
print(f"{'='*45}")
print(f"  Good     → {GOOD_FOLDER}/")
print(f"  Bad      → {BAD_FOLDER}/")
print(f"  Annotated→ {ANNOTATED_FOLDER}/")
print(f"  Graded   → {GRADED_FOLDER}/")
print("\nDone.")