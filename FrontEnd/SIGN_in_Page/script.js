/* -------------------------
   STATE -> DISTRICT LOGIC
--------------------------*/
const stateDropdown = document.getElementById("state");
const districtDropdown = document.getElementById("district");

console.log('SIGN_in_Page script loaded');

// Load states into state dropdown
for (const stateName in stateDistricts) {
  const option = document.createElement("option");
  option.value = stateName;
  option.textContent = stateName;
  stateDropdown.appendChild(option);
}

// When state changes -> load districts
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
const images = [
  "../images/corn_field.jpg",
  "../images/shutterstock_274829372.webp",
  "../images/landscape.jpg",
  "../images/shutterstock_274829372.webp"
];

let index = 0;
const heroMedia = document.querySelector('.hero-media');

if (heroMedia && images.length > 0) {
  heroMedia.style.transition = 'opacity .8s ease';
  heroMedia.style.opacity = 1;

  function setHeroBackground(src) {
    heroMedia.style.opacity = 0;
    const img = new Image();
    img.onload = () => {
      heroMedia.style.backgroundImage = `url('${src}')`;
      heroMedia.style.transform = 'translateX(50%) scale(1.03)';
      requestAnimationFrame(() => {
        heroMedia.style.opacity = 1;
      });
    };
    img.src = src;
  }

  setHeroBackground(images[0]);

  setInterval(() => {
    index = (index + 1) % images.length;
    setHeroBackground(images[index]);
  }, 6000);
}

/* -------------------------
   SIGN UP HANDLER
--------------------------*/
async function handleSignUp() {
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirm_password").value;

  // Clear previous errors
  const errorElement = document.getElementById("signupError");
  if (errorElement) errorElement.innerText = "";

  if (password !== confirmPassword) {
    if (errorElement) {
      errorElement.innerText = "Password and Confirm Password must match";
    }
    return;
  }

  const data = {
    fname: document.getElementById("fname").value,
    lname: document.getElementById("lname").value,
    phone: document.getElementById("phone").value,
    email: document.getElementById("email").value,
    password: document.getElementById("password").value,
    state: document.getElementById("state").value,
    district: document.getElementById("district").value
  };

  console.log("Registering user:", data);

  try {
    // CHANGE: Now calling gateway instead of direct auth service
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok) {
      if (errorElement) {
        errorElement.innerText = result.error || "Registration failed";
      }
      return;
    }

    // Registration successful
    console.log("Registration successful:", result);

    // Switch to sign-in tab
    const tabSignIn = document.getElementById('tab-signin');
    if (tabSignIn) tabSignIn.click();

    // Clear the signup form
    document.getElementById('signup-form').reset();

    // Show success message in signin form
    const signinError = document.getElementById('signinError');
    if (signinError) {
      signinError.style.color = '#059669';
      signinError.innerText = "Registration successful! Please sign in.";
      setTimeout(() => {
        signinError.innerText = '';
        signinError.style.color = '';
      }, 5000);
    }

  } catch (err) {
    console.error("Registration error:", err);
    if (errorElement) {
      errorElement.innerText = "Server error. Please try again.";
    }
  }
}

/* -------------------------
   SIGN IN HANDLER
--------------------------*/
async function handleSignIn() {
  const data = {
    phone: document.getElementById("signin_phone").value,
    password: document.getElementById("signin_password").value
  };

  // Clear previous errors
  const errorElement = document.getElementById("signinError");
  if (errorElement) errorElement.innerText = "";

  try {
    // CHANGE: Now calling gateway instead of direct auth service
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok) {
      if (errorElement) {
        errorElement.innerText = result.error || "Invalid credentials";
      }
      return;
    }

    // Login success - redirect to dashboard
    window.location.href = "/dashboard";

  } catch (err) {
    console.error("Login error:", err);
    if (errorElement) {
      errorElement.innerText = "Server error. Please try again.";
    }
  }
}