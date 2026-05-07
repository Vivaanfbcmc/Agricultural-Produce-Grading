import os
import time
from picamera2 import Picamera2

# Set the folder where images will be saved
SAVE_FOLDER = "/home/Ranegod/captured_images"

# Ensure the folder exists
if not os.path.exists(SAVE_FOLDER):
    os.makedirs(SAVE_FOLDER)

# Initialize the camera
picam2 = Picamera2()
picam2.configure(picam2.create_still_configuration())
picam2.start()

def capture_image():
    """Capture an image and save it to the specified folder."""
    timestamp = time.strftime("%Y-%m-%d_%H-%M-%S")
    image_path = os.path.join(SAVE_FOLDER, f"image_{timestamp}.jpg")
    picam2.capture_file(image_path)
    print(f"Image saved: {image_path}")

try:
    while True:
        input("Press Enter to capture an image... (Ctrl+C to exit)")
        capture_image()
except KeyboardInterrupt:
    print("\nExiting...")

