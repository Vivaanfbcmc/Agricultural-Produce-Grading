import cv2
import numpy as np
import torch
from segment_anything import sam_model_registry, SamAutomaticMaskGenerator

SAM_CHECKPOINT = "checkpoints/sam_vit_b_01ec64.pth"
SAM_MODEL_TYPE = "vit_b"


def load_sam_model(debug=False):
    import os
    if not os.path.exists(SAM_CHECKPOINT):
        raise FileNotFoundError(
            f"SAM checkpoint not found at {os.path.abspath(SAM_CHECKPOINT)}. "
            f"Download {os.path.basename(SAM_CHECKPOINT)} into the checkpoints/ folder before running the analyzer."
        )

    if debug:
        print("[SAM] Loading model...")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if debug:
        print(f"[SAM] Using device: {device}")

    sam = sam_model_registry[SAM_MODEL_TYPE](checkpoint=SAM_CHECKPOINT)
    sam.to(device=device)

    mask_generator = SamAutomaticMaskGenerator(
        model=sam,
        points_per_side=16,
        pred_iou_thresh=0.88,
        stability_score_thresh=0.95,
        crop_n_layers=0,
        min_mask_region_area=500,
    )

    if debug:
        print("[SAM] Model loaded.")
    return mask_generator


def get_tomato_mask(image_bgr, mask_generator, debug=False):
    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    image_hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    h, w = image_rgb.shape[:2]
    image_center = np.array([w / 2, h / 2])

    if debug:
        print("[SAM] Running segmentation...")
    masks = mask_generator.generate(image_rgb)
    if debug:
        print(f"[SAM] Found {len(masks)} segments total.")

    if not masks:
        raise ValueError("SAM found no segments in this image.")

    best_mask = _pick_best_mask(masks, image_center, h, w, image_hsv, debug=debug)

    binary_mask = (best_mask["segmentation"].astype(np.uint8)) * 255
    if debug:
        print(f"[SAM] Tomato mask selected — area: {int(best_mask['area'])} pixels")

    return binary_mask


def _pick_best_mask(masks, image_center, h, w, image_hsv, debug=False):
    image_area = h * w
    scored = []

    for m in masks:
        seg = m["segmentation"]
        area = m["area"]

        if area < 500 or area > image_area * 0.95:
            continue

        mean_sat = float(image_hsv[:, :, 1][seg].mean())
        if mean_sat < 30:
            continue

        moments = cv2.moments(seg.astype(np.uint8))
        if moments["m00"] == 0:
            continue
        cx = moments["m10"] / moments["m00"]
        cy = moments["m01"] / moments["m00"]
        dist = np.linalg.norm(np.array([cx, cy]) - image_center) / np.linalg.norm([w, h])

        contours, _ = cv2.findContours(
            seg.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        if not contours:
            continue
        perimeter = cv2.arcLength(contours[0], True)
        circularity = min((4 * np.pi * area / (perimeter ** 2)) if perimeter > 0 else 0, 1.0)

        sat_score = mean_sat / 255.0
        size_score = min(area / image_area, 0.5) * 2
        score = (sat_score * 0.50) + (circularity * 0.25) + ((1 - dist) * 0.15) + (size_score * 0.10)
        scored.append((score, m))

    if not scored:
        if debug:
            print("[SAM] Warning: all masks filtered out, falling back to most saturated mask.")
        return max(masks, key=lambda m: float(image_hsv[:, :, 1][m["segmentation"]].mean()))

    scored.sort(key=lambda x: x[0], reverse=True)

    if debug:
        print("[SAM] Top mask candidates (score | mean_sat | circularity | area):")
        for score, m in scored[:3]:
            seg = m["segmentation"]
            sat = float(image_hsv[:, :, 1][seg].mean())
            conts, _ = cv2.findContours(seg.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            perim = cv2.arcLength(conts[0], True) if conts else 1
            circ = round(min(4 * np.pi * m["area"] / (perim ** 2), 1.0), 3)
            print(f"       score={score:.3f}  sat={sat:.1f}  circ={circ}  area={m['area']}")

    return scored[0][1]