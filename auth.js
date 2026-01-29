import { auth, db } from './firebase.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    setPersistence,
    browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Enable session persistence
setPersistence(auth, browserSessionPersistence).catch((error) => {
    console.error("Auth Persistence Error:", error);
});

export async function loginUser(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return userCredential.user;
    } catch (error) {
        throw error;
    }
}

export async function registerUser(email, password, additionalData) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Create user document in Firestore
        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            email: user.email,
            role: additionalData.role || 'public',
            name: additionalData.name || '',
            surname: additionalData.surname || '',
            state: additionalData.state || '',
            district: additionalData.district || '',
            createdAt: new Date(),
            ...additionalData
        });

        return user;
    } catch (error) {
        throw error;
    }
}

export async function logoutUser() {
    try {
        await signOut(auth);
        window.location.href = 'login.html';
    } catch (error) {
        console.error("Logout failed", error);
        window.location.href = 'login.html'; // Force redirect
    }
}

export function monitorAuthState(callback) {
    return onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                // Fetch user role/data
                const userDoc = await getDoc(doc(db, "users", user.uid));
                let userData = null;
                if (userDoc.exists()) {
                    userData = userDoc.data();
                }
                callback(user, userData);
            } catch (e) {
                console.error("Error fetching user data:", e);
                callback(user, null);
            }
        } else {
            callback(null, null);
        }
    });
}
