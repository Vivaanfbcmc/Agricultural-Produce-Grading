import cv2
from ultralytics import YOLO

# Load the pre-trained YOLO model
model_path = "best.pt"  # Replace with your model path
model = YOLO(model_path)

def write_label_bounding_box(img, class_id, x1, y1, x2, y2, score, result):
    score_str = 'Score: {:.2f}'.format(score)
    class_name = result.names[int(class_id)].replace("₹", "")
    text = class_name + ' ' + score_str

    # Assign colors based on the coin type
    if class_id == 0:
        color = (255, 128, 0)  # Example color for ₹1
    elif class_id == 1:
        color = (0, 165, 255)  # Example color for ₹2
    elif class_id == 2:
        color = (147, 20, 255)  # Example color for ₹5
    elif class_id == 3:
        color = (255, 0, 255)  # Example color for ₹10
    else:
        color = (0, 0, 0)  # Default color

    cv2.rectangle(img, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)
    cv2.putText(img, text, (int(x1), int(y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2, cv2.LINE_AA)
    return img

def prediction(img, model):
    results = model(img)  # Run YOLOv8 inference
    result = results[0]
    threshold = 0.65  # Threshold for confidence
    output = {'₹1': 0, '₹2': 0, '₹5': 0, '₹10': 0}

    for i in result.boxes.data.tolist():
        x1, y1, x2, y2, score, class_id = i
        if score >= threshold:
            pred_class = result.names[int(class_id)]
            output[pred_class] += 1
            img = write_label_bounding_box(img, class_id, x1, y1, x2, y2, score, result)

    total = (output['₹1']) + (2 * output['₹2']) + (5 * output['₹5']) + (10 * output['₹10'])
    text = f"Total = {total}"
    
    # Put total amount text on the frame
    font_scale = 1
    color = (0, 255, 0)
    thickness = 2
    x, y = 50, 50
    cv2.putText(img, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, font_scale, color, thickness, cv2.LINE_AA)

    return img

# Capture from camera (use 0 for the default camera)
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("Error: Cannot open camera.")
    exit()

while True:
    # Capture frame from the camera
    ret, frame = cap.read()

    if not ret:
        break

    # Run YOLO prediction on the frame
    annotated_frame = prediction(frame, model)

    # Display the frame
    cv2.imshow("Coin Detection", annotated_frame)

    # Break the loop if 'q' is pressed
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# Release the camera and close windows
cap.release()
cv2.destroyAllWindows()

