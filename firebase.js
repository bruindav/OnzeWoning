// firebase.js — fix-1
// Koppeling met Firebase: inloggen (Auth) en database (Firestore, met offline cache).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './config.js';

export const isConfigured = Boolean(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);

export let auth = null;
export let db = null;

if (isConfigured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  try {
    // Gegevens blijven ook zonder internet leesbaar (en wijzigingen worden later verstuurd)
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
  } catch (e) {
    console.warn('[firebase] offline cache niet beschikbaar, gewone verbinding gebruikt', e);
    db = getFirestore(app);
  }
}

export const loginGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());
export const loginEmail = (email, wachtwoord) => signInWithEmailAndPassword(auth, email, wachtwoord);
export const registreerEmail = (email, wachtwoord) => createUserWithEmailAndPassword(auth, email, wachtwoord);
export const wachtwoordVergeten = (email) => sendPasswordResetEmail(auth, email);
export const uitloggen = () => signOut(auth);
export const bijInlogWijziging = (cb) => onAuthStateChanged(auth, cb);
