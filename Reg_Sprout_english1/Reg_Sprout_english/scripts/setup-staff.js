import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');

// Parse .env manually
const envContent = fs.readFileSync(envPath, 'utf-8');
const config = {};
envContent.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val.length > 0) {
    config[key.trim()] = val.join('=').trim().replace(/['"]/g, '');
  }
});

const firebaseConfig = {
  apiKey: config.VITE_FIREBASE_API_KEY,
  authDomain: config.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: config.VITE_FIREBASE_PROJECT_ID,
  storageBucket: config.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: config.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: config.VITE_FIREBASE_APP_ID,
};

console.log("Initializing Firebase...");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function createStaffUser(email, password, displayName, role) {
  try {
    let uid;
    try {
      console.log(`\nCreating user: ${email}...`);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      uid = userCredential.user.uid;
      console.log(`Auth user created successfully! UID: ${uid}`);
    } catch (authErr) {
      if (authErr.code === 'auth/email-already-in-use') {
        console.log(`[Notice] ${email} already exists in Auth. Signing in...`);
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        uid = userCredential.user.uid;
        console.log(`Signed in successfully! UID: ${uid}`);
      } else {
        throw authErr;
      }
    }

    console.log(`Assigning role '${role}' in Firestore...`);
    await setDoc(doc(db, 'staffUsers', uid), {
      email,
      displayName,
      role,
      active: true
    });
    console.log(`Role '${role}' assigned successfully for ${email}!`);
    
    await signOut(auth);
  } catch (error) {
    console.error(`[Error] Failed for ${email}:`, error.message);
  }
}

async function run() {
  console.log("Starting automated staff setup script...");
  
  // 1. Create Payment Staff
  await createStaffUser('admin@sprout.app', 'sprout', 'Payment Team', 'payment_staff');
  
  // 2. Create Report Staff
  await createStaffUser('data@sprout.app', 'sprout', 'Report Team', 'report_staff');
  
  console.log("\nSetup complete! You can now log in using these credentials.");
  process.exit(0);
}

run();
