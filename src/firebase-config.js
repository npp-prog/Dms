// DMS's own Firebase project (still named candoni-fts; a separate project just for DMS, not another LGU app's).
// Firebase console → DMS project → Project settings → General → Your apps → Web app.
// These values are not secret; access is controlled by Authentication and firestore.rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyCNI8dJaXA70z5y0oX5tu6DqzBPN9dvsGo',
  authDomain: 'candoni-fts-a2f16.firebaseapp.com',
  projectId: 'candoni-fts-a2f16',
  storageBucket: 'candoni-fts-a2f16.firebasestorage.app',
  messagingSenderId: '824193024498',
  appId: '1:824193024498:web:c7604487c1b4af4ba6eb6b',
};

// Sites that sign in through their own address instead of candoni-fts-a2f16.firebaseapp.com (Google's
// "Choose an account … to continue to" then shows this address). netlify.toml passes /__/* on to
// Firebase. Each one must also be in Firebase → Authentication → Settings → Authorized domains, and
// https://<site>/__/auth/handler in the Google Cloud OAuth client's Authorized redirect URIs.
export const OWN_AUTH_DOMAINS = ['dms.mgocandoni.com'];
