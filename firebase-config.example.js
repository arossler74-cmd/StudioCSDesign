// Copy to firebase-config.js and fill in from Firebase console → Project settings → Your apps.
// firebase-config.js is gitignored. Web API keys are not secrets, but access control lives in
// firestore.rules — review those before making the repository public.
export const firebaseConfig = {
  apiKey: 'PASTE_API_KEY',
  authDomain: 'PASTE.firebaseapp.com',
  projectId: 'PASTE_PROJECT_ID',
  storageBucket: 'PASTE.firebasestorage.app',
  messagingSenderId: 'PASTE_SENDER_ID',
  appId: 'PASTE_APP_ID',
};
