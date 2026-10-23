// FTS's own Firebase project (a separate project just for FTS, not another LGU app's).
// Firebase console → FTS project → Project settings → General → Your apps → Web app.
// Paste the values below. They are not secret; access is controlled by Authentication
// and firestore.rules.
export const firebaseConfig = {
  apiKey: 'PASTE_API_KEY',
  authDomain: 'PASTE_PROJECT_ID.firebaseapp.com',
  projectId: 'PASTE_PROJECT_ID',
  storageBucket: 'PASTE_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'PASTE_SENDER_ID',
  appId: 'PASTE_APP_ID',
};
