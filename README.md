# Vita Belle Wellness

A static website + CRM + Digital Consent System for Vita Belle Wellness, a concierge IV therapy and mobile wellness service in South Florida.

## Deployment to Cloudflare Pages

This project uses Cloudflare Pages for the frontend and Cloudflare Pages Functions for the backend API, backed by D1 (SQLite database) and R2 (Object Storage).

### 1. Initial Setup

1. **GitHub Setup**:
   - Push this code to your GitHub repository.

2. **Cloudflare Infrastructure Setup (via Wrangler CLI)**:
   You need `wrangler` installed globally (`npm install -g wrangler`) and authenticated (`wrangler login`).

   Create the Database:
   ```bash
   wrangler d1 create vitabelle-crm
   ```
   *Update `wrangler.toml` with the `database_id` returned by this command.*

   Apply the Database Schema:
   ```bash
   wrangler d1 execute vitabelle-crm --local --file=./migrations/0001_initial_schema.sql
   wrangler d1 execute vitabelle-crm --remote --file=./migrations/0001_initial_schema.sql
   ```

   Create the R2 Bucket:
   ```bash
   wrangler r2 bucket create vitabelle-pdfs
   ```

### 2. Configure Secrets

Run these commands to set up your encrypted secrets in Cloudflare:

```bash
# Generate 256-bit base64 keys first, e.g., using:
# node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

wrangler secret put ENCRYPTION_KEY
wrangler secret put HMAC_KEY
wrangler secret put TURNSTILE_SECRET_KEY
wrangler secret put PDF_SIGNING_SECRET
```

### 3. Deploy to Cloudflare Pages

1. Log in to your Cloudflare account and go to **Workers & Pages**.
2. Click **Create** > **Pages** > **Connect to Git**.
3. Select your GitHub repository.
4. In the build settings:
   - **Framework preset**: None
   - **Build command**: `npm install`
   - **Build output directory**: `/`
5. Go to the project settings in Cloudflare Dashboard:
   - **Settings > Functions > D1 database bindings**: Add binding `DB` pointing to `vitabelle-crm`.
   - **Settings > Functions > R2 bucket bindings**: Add binding `PDF_BUCKET` pointing to `vitabelle-pdfs`.
6. Click **Save and Deploy**.

## Security Controls Implemented

- **AES-256-GCM Encryption**: All PII field data and signatures stored in D1 are encrypted in transit and at rest using AES-GCM with a 96-bit unique IV per record. The encryption key is held only in Cloudflare Secrets.
- **MFA / TOTP**: The Admin CRM is secured using PBKDF2 hashed passwords and mandatory Time-Based One-Time Passwords (TOTP) compliant with RFC 6238.
- **Content Security Policy (CSP)**: Strict CSP headers are applied to `/admin/*` and `/f/*` blocking all external non-approved scripts.
- **Signed URLs**: Generated PDFs in R2 are never public. They can only be downloaded via a temporary HMAC-SHA256 signed URL.
- **Audit Trails**: All admin actions (logins, views, downloads, exports) are immutably appended to the `audit_log` D1 table.
- **Anti-Bot Protection**: Cloudflare Turnstile validates all form submissions prior to processing.
- **Rate Limiting**: IP-based rate limiting limits form submissions to mitigate abuse.

*Note: This project implements technical controls to secure PII and protected health information, but no claim is made that it is "HIPAA compliant" out of the box. Proper compliance requires administrative policies, BAA agreements with cloud providers (Google Workspace, Cloudflare Enterprise), and operational procedures.*
