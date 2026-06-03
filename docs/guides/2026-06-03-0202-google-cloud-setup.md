# Google Cloud Platform Setup Guide — OAuth Integration

This guide walks you through creating Google OAuth credentials from scratch. Follow every step in order. The whole process takes about 15 minutes.

**Who this is for**: Anyone setting up the Google integration for the first time, including non-technical PMs.

> **Note on the GCP UI**: Google uses the **Google Auth Platform** interface for OAuth setup. The left sidebar shows: Overview, Branding, Audience, Clients, Data Access, Verification Center, Settings. The steps below match this interface exactly.

---

## Step 1: Create a Google Cloud Project

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com) and sign in
2. Click the project dropdown at the top (it may say "Select a project")
3. Click **New Project**
4. Enter a project name (e.g., `AI Employee`) and click **Create**
5. Wait a few seconds, then select the new project from the dropdown

> If you already have a Google Cloud project you want to use, just select it instead.

---

## Step 2: Enable Required APIs

Do this before configuring OAuth — the OAuth flow won't work if the APIs aren't enabled.

1. In the top search bar, search for **Gmail API** → click the result → click **Enable**
2. Repeat for each of the following:

| Search for...       | What it enables                      |
| ------------------- | ------------------------------------ |
| Gmail API           | Reading and sending emails           |
| Google Drive API    | Accessing files and folders          |
| Google Docs API     | Reading and editing documents        |
| Google Sheets API   | Reading and editing spreadsheets     |
| Google Slides API   | Reading and editing presentations    |
| Google Calendar API | Reading and managing calendar events |

All six must be enabled before moving on.

---

## Step 3: Open Google Auth Platform

1. Click the hamburger menu (top left) → navigate to **Google Auth Platform**
2. If prompted to configure a project, click through and select your project
3. You'll land on the **OAuth Overview** page with a left sidebar

---

## Step 4: Configure App Branding

1. Click **Branding** in the left sidebar
2. Fill in:
   - **App name**: `AI Employee`
   - **User support email**: your email address
   - **Developer contact information** (at the bottom): your email address
3. Click **Save**

---

## Step 5: Set the Audience

1. Click **Audience** in the left sidebar
2. You'll see an **App Information** wizard with an **Audience** step showing two options:
   - **Internal** — only for Google Workspace organizations (paid). If your account is a personal Gmail, this has no effect.
   - **External** — works with any Google account. Choose this for personal Gmail accounts.
3. Select **External** and click **Next**, then complete the Contact Information step and click **Create**
4. Back on the Audience page, click **Publish App** under Publishing status
5. Confirm the prompt — the status will change to **In production**

> **You will see a yellow banner**: "Your app requires verification." Ignore it. This is just a recommendation to submit for Google's formal review process, which removes the unverified notice for public apps. For a personal or internal tool, you don't need to submit for verification. The app works fine in Production mode without it.

> **Why Production mode matters**: Testing mode causes OAuth tokens to expire after 7 days, meaning the Google connection breaks weekly. Production mode removes this limitation.

> **Drive delete note**: The `drive.file` scope used by this integration only allows the AI employee to delete files it created. It cannot delete arbitrary existing files from your Drive. If you need that capability, switch to the full `drive` scope in `src/gateway/routes/google-oauth.ts` — but be aware that scope is Restricted and will trigger a more prominent unverified app warning.

---

## Step 6: Add Scopes (Data Access)

1. Click **Data Access** in the left sidebar
2. Click **Add or Remove Scopes**
3. Paste each scope below into the filter box, check its checkbox, and repeat for all 10:

```
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/drive.readonly
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/documents
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/presentations
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
```

All 10 scopes are **Sensitive** or **Basic** — none are Restricted. Users see a standard consent screen, not a scary red "unverified" warning.

4. Click **Update** → **Save**

---

## Step 7: Create OAuth Credentials (Clients)

1. Click **Clients** in the left sidebar
2. Click **Create Client** (or **Create OAuth client** from the Overview page)
3. Set **Application type** to **Web application**
4. Name it `AI Employee Web Client`

### Authorized JavaScript origins — leave empty

> Do not enter anything here. This field is for browser-side JavaScript apps. Our OAuth flow is server-side and does not need it. Entering a URL with a path here will cause a validation error.

### Authorized redirect URIs

This is the field that matters. Click **Add URI** and add both:

```
http://localhost:7700/integrations/google/callback
```

```
https://ai-employees-laaa.onrender.com/integrations/google/callback
```

Replace the production URL with your actual domain if different.

5. Click **Create**

A dialog will show your **Client ID** and **Client Secret**. Copy both now, or click **Download JSON**. You'll need them in the next step.

---

## Step 8: Configure Environment Variables

Open `.env` and set the three Google variables:

```env
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_BASE_URL=http://localhost:7700
```

- Replace `your_client_id_here` with the Client ID from Step 7
- Replace `your_client_secret_here` with the Client Secret from Step 7
- For production deployments, set `GOOGLE_REDIRECT_BASE_URL` to your production domain

After saving, restart the gateway so it picks up the new values:

```bash
# Ctrl+C to stop, then:
pnpm dev
```

---

## Step 9: Connect Google in the Dashboard

1. Go to [http://localhost:7700/dashboard/integrations?tenant=00000000-0000-0000-0000-000000000003](http://localhost:7700/dashboard/integrations?tenant=00000000-0000-0000-0000-000000000003)
2. Find the **Google** row and click **Connect Google**
3. Sign in with the Google account you want to connect
4. Review the permissions and click **Allow**

> **If you see "Google hasn't verified this app"**: Click **Advanced** → **Go to AI Employee (unsafe)**. This is expected for apps that haven't gone through Google's formal verification process. It is safe to proceed — you built this app.

5. You'll be redirected back to the dashboard showing **✓ Connected**

---

## Step 10: Verify the Connection

Run this to confirm all 5 secrets were stored:

```bash
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT key FROM tenant_secrets WHERE tenant_id='00000000-0000-0000-0000-000000000003' AND key LIKE 'google_%' ORDER BY key;"
```

Expected output — exactly these 5 rows:

```
       key
------------------------
 google_access_token
 google_granted_scopes
 google_refresh_token
 google_token_expiry
 google_user_email
```

The integration is now active.

---

## Troubleshooting

### "Error 400: redirect_uri_mismatch"

The callback URL doesn't match what's registered in Google Cloud.

**Fix**: Go to **Google Auth Platform → Clients**, open your client, and add the exact URL shown in the error to the **Authorized redirect URIs** list. Check for typos and trailing slashes.

### "Invalid Origin: URIs must not contain a path or end with '/'"

You entered a full URL (with `/integrations/google/callback`) into the **Authorized JavaScript origins** field.

**Fix**: Leave **Authorized JavaScript origins** empty. Enter the full callback URL only in **Authorized redirect URIs**.

### "Access blocked: This app's request is invalid"

Your app is still in Testing mode.

**Fix**: Go to **Google Auth Platform → Audience**, click **Publish App**, and confirm.

### "Token has been expired or revoked"

The connected account's token expired because the app was in Testing mode when the connection was made.

**Fix**: Publish to Production mode (Step 5), then disconnect and reconnect Google in the dashboard.

### "Refresh token not returned"

The OAuth flow completed but Google didn't return a refresh token, so the connection won't survive token expiry.

**Fix**: Google skips the consent screen if the user previously authorized the app. Revoke access at [https://myaccount.google.com/permissions](https://myaccount.google.com/permissions), then reconnect — the `prompt=consent` parameter will force a fresh consent screen and return a new refresh token.

### Scopes not appearing in the consent screen

If you added scopes in Data Access but they don't show during the OAuth flow, the APIs may not be enabled.

**Fix**: Go back to Step 2 and confirm all six APIs are enabled in your project.
