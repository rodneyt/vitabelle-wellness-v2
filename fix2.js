const fs = require('fs');

// 1. Fix admin/setup.js
let setup = fs.readFileSync('functions/admin/setup.js', 'utf8');
setup = setup.replace("import { generatePBKDF2 } from '../_shared/crypto.js';", "import { hashPassword, encryptAESGCM } from '../_shared/crypto.js';");
setup = setup.replace(/const salt = crypto\.getRandomValues[\s\S]*?const hashHex = await generatePBKDF2\(password, saltHex\);/, "const hashHex = await hashPassword(password);");
setup = setup.replace(/await context\.env\.DB\.prepare\('INSERT INTO admins \(username, password_hash, salt, totp_secret\) VALUES \(\?, \?, \?, \?\)'\)\s*\.bind\(username, hashHex, saltHex, totpSecret\)/, "const encSecret = await encryptAESGCM(totpSecret, context.env.ENCRYPTION_KEY);\n  await context.env.DB.prepare('INSERT INTO admins (id, username, password_hash, totp_secret_enc) VALUES (?, ?, ?, ?)')\n    .bind(crypto.randomUUID(), username, hashHex, JSON.stringify(encSecret))");
fs.writeFileSync('functions/admin/setup.js', setup);

// 2. Fix admin/login.js
let login = fs.readFileSync('functions/admin/login.js', 'utf8');
login = login.replace("import { generatePBKDF2 } from '../_shared/crypto.js';", "import { verifyPassword } from '../_shared/crypto.js';");
// We need to see how login.js verifies the password to replace it correctly.
fs.writeFileSync('fix-login.js', 'console.log("Need to view login.js")');
