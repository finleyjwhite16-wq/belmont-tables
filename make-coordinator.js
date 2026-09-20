'use strict';
// Usage: npm run make-coordinator -- someone@school.edu
// Promotes an existing account (they must have created it first) to coordinator.
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) { console.error('Usage: npm run make-coordinator -- someone@school.edu'); process.exit(1); }
const db = new DatabaseSync(path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'belmont.db'));
const r = db.prepare("UPDATE users SET role='coordinator' WHERE email=?").run(email);
console.log(r.changes ? `${email} is now a coordinator.` : `No account found for ${email}. Have them create an account first.`);
