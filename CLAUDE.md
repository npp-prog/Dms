# DMS — conventions for changes

- **Dropdowns:** use `src/components/Select.jsx` (`import Select from '…/components/Select.jsx'`), never a bare
  `<select>`. It takes the same props and `<option>` children as `<select>`. With more than 5 choices it is
  searchable automatically; with 5 or fewer it stays a native select. Choosing a person uses `PersonPicker.jsx`
  (search by name or email).
- Tests: `npm test` (node --test on `src/lib/*.test.js`); build: `npm run build`.
- After changing `firestore.rules` or `storage.rules`, the live site needs them republished in the Firebase console.
