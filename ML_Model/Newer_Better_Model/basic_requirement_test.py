import cv2
import numpy as np
import torch
import torch.nn as nn
import os
import sys
import argparse
import json
import tempfile
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
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

YOLO_DETECT_PATH_classification = os.path.join(
    BASE_DIR,
    "Basic_Requirement_Integration1",
    "Tomato_Detection_1",
    "runs", "classify", "runs", "classify",
    "tomato_binary_balanced_e60", "weights", "best.pt"
)
YOLO_DETECT_PATH = os.path.join(
    BASE_DIR,
    "Basic_Requirement_Integration1",
    "IS_NOT_Tomato_paratwar",
    "train2-20260415T061513Z-3-001", "train2", "best.pt"
)
YOLO_BBOX_PATH    = os.path.join(BASE_DIR, "Tomato_BoundingBoxes", "best.pt")
YOLO_COIN_PATH    = os.path.join(BASE_DIR, "CoinDetection", "Coin_Detection-main",
                                 "Coin_Detection-main", "best.pt")
FRESH_MODEL_PATH  = os.path.join(BASE_DIR, "Basic_Requirement_Integration1",
                                 "rotten_fres", "rotten_fresh_mobilenet_pytorch.pth")
PEST_MODEL_PATH   = os.path.join(BASE_DIR, "Basic_Requirement_Integration1",
                                 "Pest_classifier", "pest_classifier.h5")
CUT_MODEL_PATH    = os.path.join(BASE_DIR, "Basic_Requirement_Integration1", "Cut_notCut_model1",
                                 "CutNotCutModel.pth")
SAM_CHECKPOINT    = os.path.join(BASE_DIR, "sammodel", "checkpoints", "sam_vit_b_01ec64.pth")
SAM_MODEL_TYPE    = "vit_b"

COIN_REAL_DIAMETER_MM = 22.0
COIN_CONF_THRESHOLD   = 0.2

INPUT_FOLDER     = "inputer"
GOOD_FOLDER      = "output/good"
BAD_FOLDER       = "output/bad"
ANNOTATED_FOLDER = "output/annotated"
GRADED_FOLDER    = "output/graded"
DEBUG_FOLDER     = "output/debug"

TOMATO_CONF_THRESHOLD = 0.5
BBOX_CONF_THRESHOLD   = 0.3
FRESH_CONF_THRESHOLD  = 0.6
PEST_CONF_THRESHOLD   = 0.7
CUT_CONF_THRESHOLD    = 0.6

SAM_RESIZE = 500
VALID_EXT  = (".jpg", ".jpeg", ".png", ".bmp")

# =============================================================================
# DEVICE
# =============================================================================
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"[INFO] Using device: {device}", file=sys.stderr)

# =============================================================================
# LOAD MODELS
# =============================================================================
print("[INFO] Loading models...", file=sys.stderr)

yolo_model      = YOLO(YOLO_DETECT_PATH)
yolo_bbox_model = YOLO(YOLO_BBOX_PATH)
yolo_coin_model = YOLO(YOLO_COIN_PATH)
print(f"[INFO] YOLO classify  : {yolo_model.names}", file=sys.stderr)
print(f"[INFO] YOLO bbox      : {yolo_bbox_model.names}", file=sys.stderr)
print(f"[INFO] YOLO coin      : {yolo_coin_model.names}", file=sys.stderr)

print("[INFO] Loading SAM model...", file=sys.stderr)
if not os.path.exists(SAM_CHECKPOINT):
    raise FileNotFoundError(
        f"SAM checkpoint not found at {os.path.abspath(SAM_CHECKPOINT)}."
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
print("[INFO] SAM loaded.", file=sys.stderr)

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

pest_model = load_model(PEST_MODEL_PATH)

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

print("[INFO] All models loaded.\n", file=sys.stderr)

# =============================================================================
# OUTPUT FOLDERS
# =============================================================================
for folder in [GOOD_FOLDER, BAD_FOLDER, ANNOTATED_FOLDER, GRADED_FOLDER, DEBUG_FOLDER]:
    os.makedirs(folder, exist_ok=True)

# =============================================================================
# DEBUG HELPER
# =============================================================================
def save_debug(img_bgr, img_name, step_tag, label=""):
    stem, _ = os.path.splitext(img_name)
    out_path = os.path.join(DEBUG_FOLDER, f"{stem}__{step_tag}.jpg")
    vis = img_bgr.copy()
    if label:
        cv2.rectangle(vis, (0, 0), (min(600, vis.shape[1]), 28), (20, 20, 20), -1)
        cv2.putText(vis, label, (6, 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 230, 0), 1, cv2.LINE_AA)
    cv2.imwrite(out_path, vis)
    print(f"    [DEBUG] Saved {out_path}", file=sys.stderr)

# =============================================================================
# PREPROCESSING
# =============================================================================
fresh_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])

def preprocess_fresh(img_bgr):
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    return fresh_transform(Image.fromarray(img_rgb)).unsqueeze(0).to(device)

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
# LETTERBOX RESIZE
# =============================================================================
def _resize_letterbox(img_bgr: np.ndarray, target: int) -> np.ndarray:
    h, w    = img_bgr.shape[:2]
    scale   = target / max(h, w)
    new_w   = int(round(w * scale))
    new_h   = int(round(h * scale))
    resized = cv2.resize(img_bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)
    canvas  = np.zeros((target, target, 3), dtype=np.uint8)
    y_off   = (target - new_h) // 2
    x_off   = (target - new_w) // 2
    canvas[y_off:y_off + new_h, x_off:x_off + new_w] = resized
    return canvas

# =============================================================================
# COIN COLOR FILTER
# =============================================================================
def _is_coin_color(img_bgr, x1, y1, x2, y2, min_ratio=0.25):
    crop = img_bgr[y1:y2, x1:x2]
    if crop.size == 0:
        return False
    hsv    = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    silver = cv2.inRange(hsv, np.array([0,   0, 100]), np.array([180, 55, 255]))
    gold   = cv2.inRange(hsv, np.array([15,  40,  80]), np.array([40, 220, 255]))
    ratio  = (cv2.countNonZero(silver) + cv2.countNonZero(gold)) / (crop.shape[0] * crop.shape[1])
    return ratio >= min_ratio

# =============================================================================
# STEP 1 - TOMATO DETECTION
# =============================================================================
def step1_is_tomato(img_bgr, img_name):
    results = yolo_model(img_bgr, verbose=False)[0]

    if results.boxes is None or len(results.boxes) == 0:
        print("  [Step 1] No object detected", file=sys.stderr)
        return None, "Step 1 (Tomato Detection): No object detected in the image"

    best_idx  = int(torch.argmax(results.boxes.conf).item())
    conf      = float(results.boxes.conf[best_idx])
    cls_id    = int(results.boxes.cls[best_idx])
    top_class = yolo_model.names[cls_id].lower()

    print(f"  [Step 1] DETECT -> '{top_class}' ({conf:.2f})", file=sys.stderr)

    if top_class != "tomato":
        return None, f"Step 1 (Tomato Detection): Image classified as '{top_class}' — not a tomato (confidence {conf:.0%})"

    if conf < TOMATO_CONF_THRESHOLD:
        return None, f"Step 1 (Tomato Detection): Tomato detected but confidence too low ({conf:.0%} < {TOMATO_CONF_THRESHOLD:.0%} threshold)"

    return img_bgr.copy(), None

# =============================================================================
# STEP 2 - LETTERBOX RESIZE
# =============================================================================
def step2_letterbox(img_bgr, img_name):
    resized = _resize_letterbox(img_bgr, SAM_RESIZE)
    save_debug(resized, img_name, "step2_letterbox",
               f"[2] letterbox -> {SAM_RESIZE}x{SAM_RESIZE}")
    print(f"  [Step 2] Letterboxed to {SAM_RESIZE}x{SAM_RESIZE}", file=sys.stderr)
    return resized

# =============================================================================
# STEP 3 - COIN DETECTION
# =============================================================================
def step3_coin_scale(img_bgr, img_name):
    h, w     = img_bgr.shape[:2]
    results  = yolo_coin_model(img_bgr, verbose=False)[0]
    boxes    = results.boxes
    dbg      = img_bgr.copy()
    mm_per_px = None

    if boxes is None or len(boxes) == 0:
        print("  [Step 3] No coin detected - scale unavailable", file=sys.stderr)
        save_debug(dbg, img_name, "step3_coin", "[3] No coin found")
        return dbg, None

    best_coin_data = None

    for box in boxes:
        conf     = float(box.conf[0])
        cls_name = yolo_coin_model.names[int(box.cls[0])].lower()
        if conf < COIN_CONF_THRESHOLD:
            continue
        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        if not _is_coin_color(img_bgr, x1, y1, x2, y2):
            continue
        box_w          = x2 - x1
        box_h          = y2 - y1
        pixel_diameter = (box_w + box_h) / 2.0
        pixel_radius   = pixel_diameter / 2.0
        x_center       = (x1 + x2) / 2.0
        y_center       = (y1 + y2) / 2.0
        px_per_mm      = pixel_diameter / COIN_REAL_DIAMETER_MM
        px_per_cm      = px_per_mm * 10.0
        _mm_per_px     = 1.0 / px_per_mm
        if best_coin_data is None or conf > best_coin_data["conf"]:
            best_coin_data = dict(
                conf=conf, x_center=x_center, y_center=y_center,
                pixel_radius=pixel_radius, pixel_diameter=pixel_diameter,
                px_per_cm=px_per_cm, mm_per_px=_mm_per_px,
                cls_name=cls_name, x1=x1, y1=y1, x2=x2, y2=y2
            )

    if best_coin_data is None:
        save_debug(dbg, img_name, "step3_coin", "[3] Color filter: no coin")
        return dbg, None

    d         = best_coin_data
    mm_per_px = d["mm_per_px"]
    cv2.circle(dbg, (int(d["x_center"]), int(d["y_center"])), int(d["pixel_radius"]), (0, 255, 0), 2)
    save_debug(dbg, img_name, "step3_coin", f"[3] coin scale={d['px_per_cm']:.1f}px/cm")
    return dbg, mm_per_px

# =============================================================================
# STEP 4 - YOLO BBOX
# =============================================================================
def step4_bbox_blackout(img_bgr, img_name):
    h, w    = img_bgr.shape[:2]
    results = yolo_bbox_model(img_bgr, verbose=False)[0]

    if results.boxes is None or len(results.boxes) == 0:
        print("  [Step 4] No box found - using full image", file=sys.stderr)
        return img_bgr.copy(), None

    best_idx = int(torch.argmax(results.boxes.conf).item())
    conf     = float(results.boxes.conf[best_idx])

    if conf < BBOX_CONF_THRESHOLD:
        return img_bgr.copy(), None

    box             = results.boxes.xyxy[best_idx].cpu().numpy().astype(int)
    x1, y1, x2, y2 = box
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)

    black_bg                = np.zeros_like(img_bgr)
    black_bg[y1:y2, x1:x2] = img_bgr[y1:y2, x1:x2]

    dbg = img_bgr.copy()
    cv2.rectangle(dbg, (x1, y1), (x2, y2), (0, 200, 255), 2)
    save_debug(dbg, img_name, "step4_bbox", f"[4] bbox conf={conf:.2f}")
    return black_bg, (x1, y1, x2, y2)

# =============================================================================
# STEP 5 - SAM SEGMENTATION
# =============================================================================
def _pick_best_mask(masks, image_center, h, w, image_hsv):
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
        contours, _ = cv2.findContours(seg.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue
        perimeter   = cv2.arcLength(contours[0], True)
        circularity = min((4 * np.pi * area / (perimeter ** 2)) if perimeter > 0 else 0, 1.0)
        sat_score   = mean_sat / 255.0
        size_score  = min(area / image_area, 0.5) * 2
        score       = (sat_score * 0.50) + (circularity * 0.25) + ((1 - dist) * 0.15) + (size_score * 0.10)
        scored.append((score, m))
    if not scored:
        return max(masks, key=lambda m: float(image_hsv[:, :, 1][m["segmentation"]].mean()))
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[0][1]

def step5_segment_and_blackout(img_bgr, img_name):
    h, w         = img_bgr.shape[:2]
    image_rgb    = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    image_hsv    = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    image_center = np.array([w / 2, h / 2])
    masks        = sam_mask_generator.generate(image_rgb)
    print(f"  [Step 5] SAM -> {len(masks)} segments", file=sys.stderr)
    if not masks:
        return img_bgr
    best        = _pick_best_mask(masks, image_center, h, w, image_hsv)
    binary_mask = best["segmentation"].astype(np.uint8)
    mask_3ch    = np.stack([binary_mask] * 3, axis=2)
    result      = np.where(mask_3ch == 1, img_bgr, 0).astype(np.uint8)
    dbg = img_bgr.copy()
    contours, _ = cv2.findContours(binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(dbg, contours, -1, (0, 255, 0), 2)
    save_debug(dbg, img_name, "step5_sam", f"[5] SAM mask area={int(best['area'])}px")
    return result

# =============================================================================
# STEP 6a - FRESH / ROTTEN
# =============================================================================
def step6a_fresh_rotten(img_bgr, img_name):
    tensor = preprocess_fresh(img_bgr)
    with torch.no_grad():
        probs = torch.softmax(fresh_model(tensor), dim=1)[0]

    pred_idx   = int(torch.argmax(probs).item())
    confidence = float(probs[pred_idx].item())
    label      = fresh_idx_to_class[pred_idx]
    print(f"  [Step 6a] Freshness -> {label} ({confidence:.2f})", file=sys.stderr)

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
    save_debug(annotated, img_name, "step6a_fresh", f"[6a] {label} {confidence:.2f}")

    is_rotten = (label == "rotten" and confidence >= FRESH_CONF_THRESHOLD)

    # ── Build human-readable reason ──────────────────────────────────────────
    # Include both class probabilities so the farmer understands the certainty
    fresh_pct  = float(probs[fresh_class_to_idx.get("fresh",  0)].item()) * 100
    rotten_pct = float(probs[fresh_class_to_idx.get("rotten", 1)].item()) * 100
    reason = (
        f"Step 6a (Freshness Classifier): Tomato classified as ROTTEN "
        f"with {rotten_pct:.1f}% confidence "
        f"(fresh: {fresh_pct:.1f}%, rotten: {rotten_pct:.1f}%)"
    ) if is_rotten else None

    return is_rotten, annotated, reason

# =============================================================================
# STEP 6b - PEST
# =============================================================================
def step6b_pest(img_bgr, img_name):
    pest_pred = float(pest_model.predict(preprocess_tf(img_bgr), verbose=0)[0][0])
    found     = pest_pred > PEST_CONF_THRESHOLD
    print(f"  [Step 6b] Pest -> {pest_pred:.2f}  {'FOUND' if found else 'clear'}", file=sys.stderr)

    dbg = img_bgr.copy()
    h, w = dbg.shape[:2]
    colour = (0, 0, 220) if found else (0, 200, 0)
    cv2.rectangle(dbg, (0, 0), (w, 28), (20, 20, 20), -1)
    cv2.putText(dbg, f"[6b] Pest score={pest_pred:.2f}  {'FOUND' if found else 'clear'}",
                (6, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, colour, 1, cv2.LINE_AA)
    save_debug(dbg, img_name, "step6b_pest")

    reason = (
        f"Step 6b (Pest Classifier): Pest damage detected "
        f"(score: {pest_pred:.2f}, threshold: {PEST_CONF_THRESHOLD})"
    ) if found else None

    return found, reason

# =============================================================================
# STEP 6c - CUT
# =============================================================================
def step6c_cut(img_bgr, img_name):
    with torch.no_grad():
        probs     = torch.softmax(cut_model(preprocess_torch(img_bgr)), dim=1)
        cut_class = int(torch.argmax(probs, dim=1).item())
        cut_conf  = float(probs[0][cut_class].item())

    found = cut_class == 0
    print(f"  [Step 6c] Cut -> class {cut_class} ({cut_conf:.2f})  {'CUT' if found else 'ok'}", file=sys.stderr)

    dbg = img_bgr.copy()
    h, w = dbg.shape[:2]
    colour = (0, 0, 220) if found else (0, 200, 0)
    cv2.rectangle(dbg, (0, 0), (w, 28), (20, 20, 20), -1)
    cv2.putText(dbg, f"[6c] Cut class={cut_class} conf={cut_conf:.2f}  {'CUT' if found else 'ok'}",
                (6, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, colour, 1, cv2.LINE_AA)
    save_debug(dbg, img_name, "step6c_cut")

    reason = (
        f"Step 6c (Cut/Damage Classifier): Physical cut or damage detected "
        f"(confidence: {cut_conf:.0%})"
    ) if found else None

    return found, reason

# =============================================================================
# FULL PIPELINE
# =============================================================================
def check_tomato_quality(img_bgr, img_name):
    """
    Returns (result_str, rejection_reason, annotated_img, masked_img, mm_per_px)

    rejection_reason is None when result == "GOOD", otherwise a human-readable
    string explaining exactly which ML step caused rejection and why.
    """

    # -- 1. Is it a tomato? --------------------------------------------------
    tomato_img, reason = step1_is_tomato(img_bgr, img_name)
    if tomato_img is None:
        print("  RESULT -> REJECTED (NOT A TOMATO)", file=sys.stderr)
        return "REJECTED", reason, None, None, None

    # -- 2. Letterbox resize -------------------------------------------------
    lb_img = step2_letterbox(tomato_img, img_name)

    # -- 3. Coin detection -> scale ------------------------------------------
    _, mm_per_px = step3_coin_scale(lb_img, img_name)

    # -- 4. YOLO bbox --------------------------------------------------------
    bbox_img, box_coords = step4_bbox_blackout(lb_img, img_name)

    # -- 5. SAM segmentation -------------------------------------------------
    masked_img = step5_segment_and_blackout(bbox_img, img_name)

    # -- 6a. Freshness -------------------------------------------------------
    rotten, annotated, reason = step6a_fresh_rotten(masked_img, img_name)
    if rotten:
        print("  RESULT -> REJECTED (ROTTEN)", file=sys.stderr)
        return "REJECTED", reason, annotated, masked_img, mm_per_px

    # -- 6b. Pest ------------------------------------------------------------
    pest_found, reason = step6b_pest(masked_img, img_name)
    if pest_found:
        print("  RESULT -> REJECTED (PEST)", file=sys.stderr)
        return "REJECTED", reason, annotated, masked_img, mm_per_px

    # -- 6c. Cut -------------------------------------------------------------
    cut_found, reason = step6c_cut(masked_img, img_name)
    if cut_found:
        print("  RESULT -> REJECTED (CUT)", file=sys.stderr)
        return "REJECTED", reason, annotated, masked_img, mm_per_px

    print("  RESULT -> GOOD", file=sys.stderr)
    return "GOOD", None, annotated, masked_img, mm_per_px


# =============================================================================
# SINGLE IMAGE MODE  (called by Flask / gateway via --image flag)
# =============================================================================
def run_single_image(img_path: str):
    img_name = os.path.basename(img_path)
    img      = cv2.imread(img_path)

    if img is None:
        print(json.dumps({"success": False, "message": f"Could not load image: {img_path}"}))
        return

    print(f"\n{'-'*50}", file=sys.stderr)
    print(f"  Image: {img_name}", file=sys.stderr)

    result, rejection_reason, annotated, masked_img, mm_per_px = \
        check_tomato_quality(img, img_name)

    output = {
        "result":           result,
        "mm_per_px":        mm_per_px,
        # Always include rejection_reason key; null when GOOD
        "rejection_reason": rejection_reason,
    }

    if result == "GOOD" and masked_img is not None:
        pixels_per_cm = (10.0 / mm_per_px) if (mm_per_px and mm_per_px > 0) else 50.0
        analysis      = analyse_tomato(masked_img, debug=False, pixels_per_cm=pixels_per_cm)
        output["grade"]         = analysis.grade
        output["grade_reasons"] = analysis.grade_reasons if analysis.grade_reasons else []

        if analysis.annotated_image is not None:
            cv2.imwrite(os.path.join(GRADED_FOLDER, img_name), analysis.annotated_image)

    if annotated is not None:
        cv2.imwrite(os.path.join(ANNOTATED_FOLDER, img_name), annotated)

    if result == "GOOD" and masked_img is not None:
        cv2.imwrite(os.path.join(GOOD_FOLDER, img_name), masked_img)
    elif masked_img is not None:
        cv2.imwrite(os.path.join(BAD_FOLDER, img_name), masked_img)
    else:
        cv2.imwrite(os.path.join(BAD_FOLDER, img_name), img)

    # Flask reads the LAST stdout line as JSON
    print(json.dumps(output))


# =============================================================================
# FOLDER BATCH MODE
# =============================================================================
def run_folder_mode():
    total = good = bad = failed = 0

    for img_name in sorted(os.listdir(INPUT_FOLDER)):
        if not img_name.lower().endswith(VALID_EXT):
            continue

        total    += 1
        img_path  = os.path.join(INPUT_FOLDER, img_name)
        img       = cv2.imread(img_path)

        if img is None:
            print(f"[WARN] Could not load: {img_name}", file=sys.stderr)
            failed += 1
            continue

        print(f"\n{'-'*50}")
        print(f"  Image: {img_name}")

        result, rejection_reason, annotated, masked_img, mm_per_px = \
            check_tomato_quality(img, img_name)

        if annotated is not None and masked_img is not None:
            cv2.imwrite(os.path.join(ANNOTATED_FOLDER, img_name), annotated)

        if result == "GOOD":
            good += 1
            cv2.imwrite(os.path.join(GOOD_FOLDER, img_name), masked_img)
            pixels_per_cm = (10.0 / mm_per_px) if (mm_per_px and mm_per_px > 0) else 50.0
            analysis      = analyse_tomato(masked_img, debug=True, pixels_per_cm=pixels_per_cm)
            print(f"  AGMARK GRADE   -> {analysis.grade}")
            if analysis.grade_reasons:
                for reason in analysis.grade_reasons:
                    print(f"                   {reason}")
            if analysis.annotated_image is not None:
                cv2.imwrite(os.path.join(GRADED_FOLDER, img_name), analysis.annotated_image)
        else:
            bad += 1
            print(f"  REJECTION REASON -> {rejection_reason}")
            save_img = masked_img if masked_img is not None else img
            cv2.imwrite(os.path.join(BAD_FOLDER, img_name), save_img)

    print(f"\n{'='*50}")
    print(f"  Total: {total}  Good: {good}  Rejected: {bad}  Failed: {failed}")
    print("Done.")


# =============================================================================
# ENTRY POINT
# =============================================================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Tomato Quality Pipeline")
    parser.add_argument("--image", type=str, default=None,
                        help="Path to a single image file. Omit for batch folder mode.")
    args = parser.parse_args()

    if args.image:
        run_single_image(args.image)
    else:
        run_folder_mode()