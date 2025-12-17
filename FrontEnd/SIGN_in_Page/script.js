/* -------------------------
   STATE → DISTRICT LOGIC
--------------------------*/

const stateDropdown = document.getElementById("state");
const districtDropdown = document.getElementById("district");

// Load states into state dropdown
for (const stateName in stateDistricts) {
  const option = document.createElement("option");
  option.value = stateName;
  option.textContent = stateName;
  stateDropdown.appendChild(option);
}

// When state changes → load districts
stateDropdown.addEventListener("change", function () {
  const selectedState = this.value;

  // CLEAR old districts
  districtDropdown.innerHTML = '<option value="">Select District</option>';

  if (!selectedState || !stateDistricts[selectedState]) return;

  // LOAD new districts
  stateDistricts[selectedState].forEach(dist => {
    const opt = document.createElement("option");
    opt.value = dist;
    opt.textContent = dist;
    districtDropdown.appendChild(opt);
  });
});


/* -------------------------
   IMAGE CHANGING LOGIC
--------------------------*/

// Put your image file names here
// (Leave empty for now, you can fill later)
const images = [
  
  "../images/corn_field.jpg",
  "../images/shutterstock_274829372.webp"
];

let index = 0;
const heroMedia = document.querySelector('.hero-media');

// If no hero container or no images, skip rotation
if (heroMedia && images.length > 0) {
  // initialize background and transition
  heroMedia.style.transition = 'opacity .8s ease';
  heroMedia.style.opacity = 1;

  // helper to set bg with preload
  function setHeroBackground(src) {
    // fade out
    heroMedia.style.opacity = 0;

    const img = new Image();
    img.onload = () => {
      heroMedia.style.backgroundImage = `url('${src}')`;
      // slight scale effect via transform for subtle motion
      heroMedia.style.transform = 'translateX(50%) scale(1.03)';
      // fade in
      requestAnimationFrame(() => {
        heroMedia.style.opacity = 1;
      });
    };
    img.src = src;
  }

  // set initial image
  setHeroBackground(images[0]);

  // rotate images
  setInterval(() => {
    index = (index + 1) % images.length;
    setHeroBackground(images[index]);
  }, 6000);
}

function handleSignUp() {
  const data = {
    fname: document.getElementById("fname").value,
    lname: document.getElementById("lname").value,
    phone: document.getElementById("phone").value,
    email: document.getElementById("email").value,
    password: document.getElementById("password").value,
    state: document.getElementById("state").value,
    district: document.getElementById("district").value,
    veg_type: document.getElementById("veg_type").value,
  };

  fetch("http://localhost:5000/api/auth/register", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(data)
  })
      .then(res => res.json())
      .then(data => console.log(data));

  console.log("signed up ig");
}


function handleSignIn() {
  const data = {
    phone: document.getElementById("signin_phone").value,
    password: document.getElementById("signin_password").value
  };

  fetch("http://localhost:5000/api/auth/login", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(data)
  })
      .then(res => res.json())
      .then(data => console.log(data));
}
