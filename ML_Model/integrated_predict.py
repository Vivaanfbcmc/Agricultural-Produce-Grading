import os
import cv2
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import load_model
from flask import Flask, request, jsonify
from flask_cors import CORS

IMG_SIZE = 128
GRADE_CLASSES = ["A", "B", "C", "R"]  # Added Rotten grade

# Load models once
tomato_model = load_model("tomato_classifier.h5")
grading_model = load_model("tomato_grading_model.h5")

def preprocess(img):
    img = cv2.resize(img, (IMG_SIZE, IMG_SIZE))
    img = img.astype("float32") / 255.0
    img = np.expand_dims(img, axis=0)
    return tf.convert_to_tensor(img)

def center_crop(img):
    h, w, _ = img.shape
    size = min(h, w)
    sx = w // 2 - size // 2
    sy = h // 2 - size // 2
    return img[sy:sy+size, sx:sx+size]

def predict_grade(file):
    arr = np.frombuffer(file.read(), np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return "R"

    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    t_input = preprocess(img_rgb)
    t_pred = tomato_model.predict(t_input, verbose=0)
    if np.argmax(t_pred) == 0:
        return "R"

    cropped = center_crop(img_rgb)
    g_input = preprocess(cropped)
    g_pred = grading_model.predict(g_input, verbose=0)
    idx = int(np.argmax(g_pred))
    return GRADE_CLASSES[idx]

app = Flask(__name__)
CORS(app)  # Fix CORS for all origins

@app.route('/analyze', methods=['POST', 'OPTIONS'])
def analyze_image():
    if request.method == 'OPTIONS':
        return jsonify({"success": True}), 200

    if 'image' not in request.files:
        return jsonify({"success": False, "message": "No image uploaded"}), 400

    try:
        grade = predict_grade(request.files['image'])
        return jsonify({"success": True, "grade": grade})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

if __name__ == "__main__":
    print("✅ ML API running on http://localhost:5001")
    app.run(port=5001, threaded=True)
