import os
import cv2
import numpy as np

# ── CONFIG ─────────────────────────────────────────────────────
YOLO_MODEL_PATH     = r"D:\COLLEGE STUFF\sem7\finaly\ML_Model\detect\tomato_detector_final\weights\best.pt"
TOMATO_CONF_THRESHOLD = 0.40

_yolo = None

def _load():
    global _yolo
    if _yolo is not None:
        return
    try:
        from ultralytics import YOLO
        if not os.path.exists(YOLO_MODEL_PATH):
            raise FileNotFoundError(f"YOLO model not found at: {YOLO_MODEL_PATH}")
        _yolo = YOLO(YOLO_MODEL_PATH)
        print(f"Custom tomato YOLO loaded from {YOLO_MODEL_PATH}")
        print(f"   Classes: {_yolo.names}")
    except Exception as e:
        print(f"YOLO load failed: {e}")
        raise

_load()


def is_tomato(img_bgr: np.ndarray) -> dict:
    """
    Step 1: Run custom YOLO (best.pt) on the image.
    Step 2: If YOLO is uncertain, fallback to HSV red color check.

    Returns: { is_tomato, confidence, detected_as }
    """
    if _yolo is None:
        raise RuntimeError("YOLO model not loaded")

    results = _yolo(img_bgr, verbose=False)[0]
    boxes   = results.boxes

    best_tomato_conf = 0.0
    best_other_label = ""
    best_other_conf  = 0.0

    if boxes is not None and len(boxes) > 0:
        for box in boxes:
            conf     = float(box.conf[0])
            cls_id   = int(box.cls[0])
            cls_name = _yolo.names.get(cls_id, "").lower()

            if "tomato" in cls_name:
                if conf > best_tomato_conf:
                    best_tomato_conf = conf
            else:
                if conf > best_other_conf:
                    best_other_conf  = conf
                    best_other_label = cls_name

        # Clearly a tomato
        if best_tomato_conf >= TOMATO_CONF_THRESHOLD:
            return {
                "is_tomato":   True,
                "confidence":  round(best_tomato_conf * 100, 2),
                "detected_as": "tomato"
            }

        # Clearly something else
        if best_other_conf >= TOMATO_CONF_THRESHOLD:
            return {
                "is_tomato":   False,
                "confidence":  round(best_other_conf * 100, 2),
                "detected_as": best_other_label
            }

    # ── YOLO uncertain → HSV red color fallback ────────────────
    # Tomatoes are red: hue 0–10 and 160–180 in OpenCV HSV
    hsv        = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    mask1      = cv2.inRange(hsv, np.array([0,   60,  60]), np.array([10,  255, 255]))
    mask2      = cv2.inRange(hsv, np.array([160, 60,  60]), np.array([180, 255, 255]))
    red_ratio  = float(np.sum(cv2.bitwise_or(mask1, mask2) > 0)) / (img_bgr.shape[0] * img_bgr.shape[1])

    print(f"   HSV red ratio: {red_ratio:.3f}")

    if red_ratio >= 0.25:
        return {
            "is_tomato":   True,
            "confidence":  round(red_ratio * 100, 2),
            "detected_as": "tomato (color check)"
        }
    else:
        return {
            "is_tomato":   False,
            "confidence":  round(red_ratio * 100, 2),
            "detected_as": best_other_label or "unknown"
        }