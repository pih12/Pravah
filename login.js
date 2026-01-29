import { loginUser, registerUser, monitorAuthState } from './auth.js';
import { db } from './firebase.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Elements
// Elements
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const roleInput = document.getElementById('role'); // For registration
const roleGroup = document.getElementById('role-group');
const registerFields = document.getElementById('register-fields');

// Toggle Buttons
const toggleAuthBtn = document.getElementById('toggle-auth');
const toggleText = document.getElementById('toggle-text');
// Selector fix for new Landing Page design
const authTitle = document.querySelector('.landing-title');
const submitBtn = document.getElementById('submit-btn');
const btnText = document.getElementById('btn-text');
const btnLoader = document.getElementById('btn-loader');
const errorMessage = document.getElementById('error-message');

let isLogin = true;
let isRegistering = false;
let authUnsubscribe = null;

// Init
authUnsubscribe = monitorAuthState(async (user) => {
    if (user && !isRegistering) {
        // Redundancy check if user is already logged in
        const userDoc = await getFirestoreDoc(user.uid);
        const role = userDoc?.role || 'public';
        redirectToDashboard(role);
    }
});

// Event Listeners
toggleAuthBtn.addEventListener('click', () => {
    isLogin = !isLogin;
    updateUI();
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value;
    const password = passwordInput.value;

    setLoading(true);
    errorMessage.style.display = 'none';

    try {
        if (isLogin) {
            const user = await loginUser(email, password);
            console.log("Auth Successful. Fetching profile for:", user.uid);

            // Check role from Firestore to redirect
            const userDoc = await getFirestoreDoc(user.uid);

            if (!userDoc) {
                // REPAIR STRATEGY: Create default public profile if missing
                console.warn("User profile missing. Attempting auto-repair...");

                // RECOVERY: Check LocalStorage for intended role (if registration DB write failed previously)
                const savedRole = localStorage.getItem('saved_role_' + user.email);
                const roleToUse = savedRole || 'public';

                try {
                    await setDoc(doc(db, "users", user.uid), {
                        uid: user.uid,
                        email: user.email,
                        role: roleToUse,
                        createdAt: new Date(),
                        name: 'Unknown',
                        repaired: true
                    });
                    console.log("Profile repaired as:", roleToUse);
                    redirectToDashboard(roleToUse);
                    return;
                } catch (repairErr) {
                    console.error("Repair failed:", repairErr);

                    // FALLBACK: If DB is locked (Permission Error), use Local Session
                    console.warn("Activating Local Session Fallback due to DB error.");

                    // Determine Role:
                    let fallbackRole = 'public';
                    if (!isLogin && roleInput) {
                        fallbackRole = roleInput.value;
                    } else if (savedRole) {
                        // Use the role we saved locally during registration!
                        fallbackRole = savedRole;
                    } else if (user.email.toLowerCase().includes('admin') || user.email.toLowerCase().includes('ngo')) {
                        // Basic inference for login fallback
                        fallbackRole = user.email.toLowerCase().includes('ngo') ? 'ngo' : 'admin';
                    }

                    // Store in SessionStorage so Dashboard can pick it up
                    sessionStorage.setItem('temp_user_data', JSON.stringify({
                        role: fallbackRole,
                        name: !isLogin && document.getElementById('reg-name') ? document.getElementById('reg-name').value : 'Temporary User',
                        email: user.email,
                        localMode: true
                    }));

                    redirectToDashboard(fallbackRole);
                    return;
                }
            }

            // Fallback for demo admins or whitelisted emails
            let role = userDoc.role || 'public';
            const adminEmails = ['nipun@example.com', 'admin@gmail.com', 'authority@pravah.com']; // Add your email here

            if (user.email.toLowerCase().includes('admin') || adminEmails.includes(user.email.toLowerCase())) {
                role = 'admin';
            }

            console.log("Redirecting to dashboard for role:", role);
            redirectToDashboard(role);
        } else {
            // Register
            isRegistering = true;
            if (authUnsubscribe) authUnsubscribe(); // Stop listening

            const role = roleInput.value;
            const name = document.getElementById('reg-name').value;
            const surname = document.getElementById('reg-surname').value;
            const state = document.getElementById('reg-state').value;
            const district = document.getElementById('reg-district').value;

            if (!name || !surname || !state || !district) {
                throw new Error("Please fill in all personal details");
            }

            await registerUser(email, password, { role, name, surname, state, district });
            redirectToDashboard(role);
        }
    } catch (error) {
        if (!isLogin) {
            // Check if Auth succeeded but Firestore failed (Zombie state)
            import('./firebase.js').then(({ auth }) => {
                if (auth.currentUser) {
                    console.warn("Registration: Auth success, DB failed. Using Fallback.");
                    // Falliback: Save intent to session and redirect
                    const role = roleInput.value;
                    const name = document.getElementById('reg-name').value;

                    // Persist role intent for future logins on this device
                    localStorage.setItem('saved_role_' + email, role);

                    sessionStorage.setItem('temp_user_data', JSON.stringify({
                        role: role,
                        name: name,
                        email: email,
                        localMode: true
                    }));

                    redirectToDashboard(role);
                    return;
                }
            });
            isRegistering = false;
        }
        console.error("Login Error:", error);
        showError(error.message);
        setLoading(false);
    }
});

async function getFirestoreDoc(uid) {
    // Retry mechanism: 3 attempts with 1s delay
    for (let i = 0; i < 3; i++) {
        try {
            const snap = await getDoc(doc(db, "users", uid));
            if (snap.exists()) return snap.data();
            console.log(`Profile fetch attempt ${i + 1} failed. Retrying...`);
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
            console.error("Firestore Read Error:", e);
        }
    }
    console.warn("User document not found after retries for UID:", uid);
    return null;
}

function redirectToDashboard(role) {
    const r = (role || '').toLowerCase();

    // Explicit alerting for debug if needed, but console log is safer
    console.log("Routing logic for:", r);

    if (r === 'admin' || r === 'authority') window.location.href = 'admin-dashboard.html';
    else if (r === 'ngo') window.location.href = 'ngo-dashboard.html';
    else window.location.href = 'public-dashboard.html';
}

function updateUI() {
    errorMessage.style.display = 'none';

    // Ensure authTitle exists before trying to update it
    if (authTitle) {
        if (isLogin) {
            authTitle.innerText = "Civic Connect";
            btnText.innerText = "Sign In";
            toggleText.innerText = "Don't have an account?";
            toggleAuthBtn.innerText = "Create Account";
            roleGroup.style.display = 'none';
            registerFields.style.display = 'none';
            // Optional: Show subtitle for login
            const sub = document.querySelector('.landing-subtitle');
            if (sub) sub.innerText = "Report. Track. Resolve.";
        } else {
            authTitle.innerText = "Join Civic Connect";
            btnText.innerText = "Sign Up";
            toggleText.innerText = "Already have an account?";
            toggleAuthBtn.innerText = "Sign In";
            roleGroup.style.display = 'block';
            registerFields.style.display = 'block';
            // Optional: Update subtitle for register
            const sub = document.querySelector('.landing-subtitle');
            if (sub) sub.innerText = "Create your citizen profile";
        }
    }
}

function setLoading(loading) {
    submitBtn.disabled = loading;
    if (loading) {
        btnText.style.display = 'none';
        btnLoader.style.display = 'inline-block';
    } else {
        btnText.style.display = 'block';
        btnLoader.style.display = 'none';
    }
}

function showError(msg) {
    errorMessage.innerText = msg.replace('Firebase:', '').replace('auth/', '');
    errorMessage.style.display = 'block';
}
