const imageInput = document.getElementById("imageInput");
const preview = document.getElementById("preview");
const resultImage = document.getElementById("resultImage");

imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    preview.src = reader.result;
    preview.style.display = "block";
  };
  reader.readAsDataURL(file);
});

function submitImage() {
  if (!preview.src) {
    alert("Upload an image first");
    return;
  }

  document.querySelector(".result").classList.remove("hidden");
  resultImage.src = preview.src;

  const grades = ["A", "B", "C"];
  const prices = {
    A: "₹40 – ₹60 / kg",
    B: "₹25 – ₹40 / kg",
    C: "₹10 – ₹25 / kg"
  };

  const grade = grades[Math.floor(Math.random() * grades.length)];

  document.getElementById("grade").innerText = grade;
  document.getElementById("price").innerText = prices[grade];

  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}
