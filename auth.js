let appIniciada = false;

document.getElementById("form-login").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const error = document.getElementById("login-error");
  error.textContent = "";

  auth.signInWithEmailAndPassword(email, password).catch((err) => {
    if (err.code === "auth/invalid-email" || err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
      error.textContent = "Usuario o contraseña incorrectos.";
    } else if (err.code === "auth/network-request-failed") {
      error.textContent = "Sin conexión a internet. Probá de nuevo cuando tengas señal.";
    } else {
      error.textContent = "No se pudo iniciar sesión. Probá de nuevo.";
    }
  });
});

document.getElementById("btn-salir").addEventListener("click", () => {
  auth.signOut();
});

auth.onAuthStateChanged((usuario) => {
  const login = document.getElementById("pantalla-login");
  const contenido = document.getElementById("app-contenido");
  if (usuario) {
    login.hidden = true;
    contenido.hidden = false;
    if (!appIniciada) {
      appIniciada = true;
      if (typeof iniciarApp === "function") iniciarApp();
    }
  } else {
    login.hidden = false;
    contenido.hidden = true;
  }
});
