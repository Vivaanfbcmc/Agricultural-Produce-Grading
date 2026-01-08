import cv2
import numpy as np
import os
import tensorflow as tf
from tensorflow.keras.models import load_model
from gradcam import make_gradcam_heatmap

# ================= CONFIG =================
IMG_SIZE = 128

GRADE_CLASSES = [
    "Grade A (Red)",
    "Grade B (Orange / Yellow)",
    "Grade C (Green)",
    "Rotten"
]

# ================= LOAD MODELS =================
tomato_model = load_model("tomato_classifier.h5")
grading_model = load_model("tomato_grading_model.h5")

# ================= FIND LAST CONV LAYER =================
def get_last_conv_layer(model):
    for layer in reversed(model.layers):
        if "conv" in layer.name.lower():
            return layer.name
    return None

LAST_CONV_LAYER = get_last_conv_layer(grading_model)
print("✅ Grad-CAM layer:", LAST_CONV_LAYER)

# ================= PREPROCESS =================
def preprocess(img):
    img = cv2.resize(img, (IMG_SIZE, IMG_SIZE))
    img = img.astype("float32") / 255.0
    img = np.expand_dims(img, axis=0)
    return tf.convert_to_tensor(img)

# ================= CENTER CROP =================
def center_crop(img):
    h, w, _ = img.shape
    size = min(h, w)
    sx = w // 2 - size // 2
    sy = h // 2 - size // 2
    return img[sy:sy+size, sx:sx+size]

# ================= PIPELINE =================
def predict(image_path, show_gradcam=True):
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    img = cv2.imread(image_path)
    if img is None:
        raise ValueError("Failed to load image")

    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    # ---- STEP 1: TOMATO CHECK ----
    tomato_input = preprocess(img)
    tomato_pred = tomato_model.predict(tomato_input, verbose=0)

    if np.argmax(tomato_pred) == 0:
        return "Not a Tomato", 0.0

    # ---- STEP 2: CROP ----
    cropped = center_crop(img)

    # ---- STEP 3: GRADE ----
    grading_input = preprocess(cropped)
    grade_pred = grading_model.predict(grading_input, verbose=0)

    print("Grading probabilities:", grade_pred)

    idx = np.argmax(grade_pred)
    grade = GRADE_CLASSES[idx]
    confidence = float(np.max(grade_pred) * 100)

    # ---- STEP 4: GRAD-CAM (OPTIONAL & SAFE) ----
    if show_gradcam and LAST_CONV_LAYER is not None:
        heatmap = make_gradcam_heatmap(
            grading_input,
            grading_model,
            LAST_CONV_LAYER
        )

        if heatmap is not None:
            heatmap = cv2.resize(heatmap, (cropped.shape[1], cropped.shape[0]))
            heatmap = np.uint8(255 * heatmap)
            heatmap = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)
            overlay = cv2.addWeighted(cropped, 0.6, heatmap, 0.4, 0)

            cv2.imshow("Grad-CAM", overlay)
            cv2.waitKey(0)
            cv2.destroyAllWindows()
        else:
            print("⚠️ Grad-CAM skipped (gradients unavailable)")

    return grade, confidence

# ================= MAIN =================
if __name__ == "__main__":
    result = predict("D:\\Assignments\\tomato_project\\images (17).jpg")
    print("\n🍅 FINAL RESULT")
    print(result)
