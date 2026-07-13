// Reemplazar estos valores por los del proyecto real de Firebase
// (Firebase Console → Configuración del proyecto → Tus apps → Config de la app web).
// Estos valores no son secretos: la seguridad la dan las reglas de Firestore.
const firebaseConfig = {
  apiKey: "AIzaSyC4OonNOaQi-ZDYnoZT-mKNv-fiYCAP0tg",
  authDomain: "zogoibi-campo.firebaseapp.com",
  projectId: "zogoibi-campo",
  storageBucket: "zogoibi-campo.firebasestorage.app",
  messagingSenderId: "267084166438",
  appId: "1:267084166438:web:12470fea7e39bb638cfde7",
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

db.enablePersistence().catch(() => {
  // Falla si hay más de una pestaña abierta a la vez, o el navegador no soporta persistencia.
  // La app sigue funcionando igual, solo sin caché offline en ese caso.
});
