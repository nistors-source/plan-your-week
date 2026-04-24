import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

// Add Scopes for Google Calendar
googleProvider.addScope('https://www.googleapis.com/auth/calendar.events');
// To stay "sunk in" and avoid frequent re-prompts, we can add prompt: 'select_account' if wanted, 
// but usually default is fine.
