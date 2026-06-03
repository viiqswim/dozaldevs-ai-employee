# Google Cloud Platform Setup Guide — OAuth Integration

This guide walks you through creating Google OAuth credentials from scratch. Follow every step in order. The whole process takes about 15 minutes.

**Who this is for**: Anyone setting up the Google integration for the first time, including non-technical PMs.

---

## Step 1: Create a Google Cloud Project

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Sign in with your Google account
3. Click the project dropdown at the top of the page (it may say "Select a project")
4. Click **New Project**
5. Enter a project name (e.g., "AI Employee") and click **Create**
6. Wait a few seconds for the project to be created, then select it from the dropdown

> **Note**: If you already have a Google Cloud project you want to use, just select it instead of creating a new one.

---

## Step 2: Enable Required APIs

The platform needs access to several Google services. You'll enable each one individually.

1. In the left sidebar, go to **APIs & Services > Library**
2. Search for and enable each of the following APIs (click the API name, then click **Enable**):

| API                 | What it's used for                   |
| ------------------- | ------------------------------------ |
| Gmail API           | Reading and sending emails           |
| Google Drive API    | Accessing files and folders          |
| Google Docs API     | Reading and editing documents        |
| Google Sheets API   | Reading and editing spreadsheets     |
| Google Slides API   | Reading and editing presentations    |
| Google Calendar API | Reading and managing calendar events |

Repeat the search-and-enable process for all six APIs before moving on.

---

## Step 3: Configure the OAuth Consent Screen

This is the screen users see when they authorize the app. You need to configure it before creating credentials.

1. Go to **APIs & Services > OAuth consent screen**
2. Select **External** as the user type, then click **Create**

### Fill in the app information

- **App name**: Enter something recognizable, like "AI Employee"
- **User support email**: Enter your email address
- **Developer contact information**: Enter your email address again at the bottom of the page
- Click **Save and Continue**

### Add scopes

Scopes define what the app is allowed to access. On the Scopes page:

1. Click **Add or Remove Scopes**
2. Add each of the following scopes (paste each one into the filter box to find it, then check the checkbox):

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

All 10 of these scopes are either **Sensitive** or **Basic** — none are Restricted. This means users will see a standard consent screen without a scary "unverified" warning, even before the app goes through Google's formal verification.

3. Click **Update** to confirm, then **Save and Continue**

### Add test users (optional)

If you want to test before publishing, you can add specific Google accounts as test users. Otherwise, skip this step and click **Save and Continue**.

### Publish to Production mode

> **CRITICAL: Do not skip this step.**

By default, your app is in **Testing** mode. In Testing mode, OAuth tokens expire after 7 days, which means every connected account will stop working after a week and users will need to reconnect.

To fix this permanently:

1. Go back to **APIs & Services > OAuth consent screen**
2. Under "Publishing status", click **Publish App**
3. Confirm the prompt

Your app is now in **Production** mode. Tokens will not expire on a 7-day cycle.

> **Why does this matter?** Testing mode is meant for development with a small list of approved test users. Production mode is required for any real usage, even if you haven't gone through Google's formal app verification process. The scopes used by this integration are all Sensitive or Basic, so users will see a standard consent screen — not the scary red "unverified" warning that Restricted scopes (like `gmail.modify` or `drive`) would trigger.
>
> **Drive delete note**: The `drive.file` scope only allows the AI employee to delete files it created. It cannot delete arbitrary existing files from your Drive. If you need that capability, switch to the full `drive` scope (Restricted — will trigger the unverified warning).

---

## Step 4: Create OAuth 2.0 Credentials

1. Go to **APIs & Services > Credentials**
2. Click **+ Create Credentials** at the top
3. Select **OAuth 2.0 Client ID**
4. Set **Application type** to **Web application**
5. Give it a name (e.g., "AI Employee Web Client")

### Add authorized redirect URIs

This tells Google which URLs are allowed to receive the OAuth callback. Add both:

- **Local development**: `http://localhost:7700/integrations/google/callback`
- **Production**: `https://your-domain.com/integrations/google/callback`

Replace `your-domain.com` with your actual production domain.

6. Click **Create**

A dialog will appear with your **Client ID** and **Client Secret**. Copy both values now, or click **Download JSON** to save them. You'll need these in the next step.

---

## Step 5: Configure Environment Variables

Open your `.env` file and add the following three variables:

```env
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_BASE_URL=http://localhost:7700
```

- Replace `your_client_id_here` with the Client ID from Step 4
- Replace `your_client_secret_here` with the Client Secret from Step 4
- For production, change `GOOGLE_REDIRECT_BASE_URL` to your production domain (e.g., `https://your-domain.com`)

After saving the file, restart the gateway service for the changes to take effect.

---

## Step 6: Connect Google in the Dashboard

1. Go to [http://localhost:7700/dashboard/integrations](http://localhost:7700/dashboard/integrations)
2. Find the Google section and click **Connect Google**
3. A Google sign-in window will open. Sign in with the Google account you want to connect
4. Review the permissions and click **Allow**
5. You'll be redirected back to the dashboard. Verify that the Google section now shows **Connected**

The integration is now active.

---

## Troubleshooting

### "Error 400: redirect_uri_mismatch"

The callback URL in your request doesn't match what's registered in Google Cloud.

**Fix**: Go to **APIs & Services > Credentials**, open your OAuth 2.0 Client ID, and add the exact URL shown in the error message to the authorized redirect URIs list. Make sure there are no trailing slashes or typos.

### "Access blocked: This app's request is invalid"

Your app is in Testing mode and is trying to request sensitive scopes that haven't been verified.

**Fix**: Follow Step 3 above to publish your app to Production mode.

### "Token has been expired or revoked"

The connected account's token expired because the app was in Testing mode when the connection was made.

**Fix**: Publish the app to Production mode (Step 3), then disconnect and reconnect the Google account in the dashboard.

### "Refresh token not returned"

The OAuth flow completed but didn't return a refresh token, so the connection can't stay active long-term.

**Fix**: This usually means the user has already authorized the app before and Google skipped the consent screen. Contact support to reset the OAuth connection, or try revoking access from [https://myaccount.google.com/permissions](https://myaccount.google.com/permissions) and reconnecting.

### Scopes not appearing in the consent screen

If you added scopes but they don't show up during the OAuth flow, the APIs may not be enabled.

**Fix**: Go back to Step 2 and confirm all six APIs are enabled in your project.
