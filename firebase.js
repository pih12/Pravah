import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBgqLI1JA6JW3vL6o7GhXcd99j0xZXTjTU",
    authDomain: "pravah-262230.firebaseapp.com",
    projectId: "pravah-262230",
    storageBucket: "pravah-262230.appspot.com",
    messagingSenderId: "824706401687",
    appId: "1:824706401687:web:f542102255c6ac7d8470d2"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };
