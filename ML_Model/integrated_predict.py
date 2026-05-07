import subprocess
import tempfile
import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Path to your existing pipeline script
#PIPELINE_SCRIPT = r"D:\COLLEGE STUFF\sem7\Final_Year_project_final_ML_\Basic_Requirement_Integration1\main_pipeline.py"
PIPELINE_SCRIPT ="Newer_Better_Model/basic_requirement_test.py"
@app.route('/analyze', methods=['POST', 'OPTIONS'])
def analyze_image():
    if request.method == 'OPTIONS':
        return jsonify({"success": True}), 200

    if 'image' not in request.files:
        return jsonify({"success": False, "message": "No image uploaded"}), 400

    try:
        file = request.files['image']
        suffix = os.path.splitext(file.filename)[-1] or ".jpg"

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name

        result = subprocess.run(
            ["python", PIPELINE_SCRIPT, "--image", tmp_path],
            capture_output=True,
            text=True
        )

        os.unlink(tmp_path)

        if result.returncode != 0:
            return jsonify({"success": False, "message": result.stderr}), 500

        # Pipeline script must print a JSON object as its last line
        last_line = result.stdout.strip().splitlines()[-1]
        output = json.loads(last_line)
        return jsonify({"success": True, **output})

    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


if __name__ == "__main__":
    print("Tomato Pipeline API -> http://localhost:5001")
    app.run(port=5001, threaded=False)