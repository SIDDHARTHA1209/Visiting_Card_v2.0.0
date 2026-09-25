# Digital Visiting Card Creator v2.0.0

A serverless digital visiting-card creator using pure HTML5/CSS3/Vanilla JavaScript, Google Apps Script, Google Sheets, Google Drive, and a lightweight QR-code CDN.

## Architecture

```text
Browser
  │
  ├── Registration form
  │     ├── Client validation
  │     ├── Image resize/compression
  │     ├── Local draft persistence
  │     └── POST JSON
  │
  ▼
Google Apps Script Web App
  │
  ├── Validate request
  ├── Generate GUID
  ├── Upload large images to Drive
  ├── Append Google Sheets row
  ├── Cache card record
  └── Send confirmation email
  │
  ▼
Google Sheets + Google Drive
```

The public frontend is static. The Apps Script project is the backend API.

## Project structure

```text
Visiting_Card_v2.0.0/
├── README.md
├── backend/
│   ├── Code.gs
│   └── appsscript.json
└── public/
    ├── index.html
    ├── style.css
    ├── script.js
    ├── card/
    │   ├── index.html
    │   ├── style.css
    │   └── script.js
    └── success/
        ├── index.html
        ├── style.css
        └── script.js
```

## 1. Create the Google Sheet

1. Open Google Sheets.
2. Create a new spreadsheet.
3. Give it a name such as `Digital Visiting Cards`.
4. Copy the spreadsheet ID from the URL:

```text
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
```

5. Do not manually create the headers. The backend creates the exact required header row automatically.

Required column order:

```text
guid
name
title
instituteName
tagline
address
website
phone
whatsapp
emails
logoUrl
photoUrl
locationLink
customLinks
createdAt
```

## 2. Create the Apps Script backend

1. Open the spreadsheet.
2. Select `Extensions -> Apps Script`.
3. Replace the generated `Code.gs` with `backend/Code.gs`.
4. Replace `appsscript.json` with `backend/appsscript.json`.
5. In `Code.gs`, update:

```javascript
const CONFIG={
  SPREADSHEET_ID:"YOUR_SPREADSHEET_ID",
  SHEET_NAME:"Cards",
  DRIVE_FOLDER_ID:"YOUR_DRIVE_FOLDER_ID",
  FRONTEND_BASE_URL:"https://YOUR-FRONTEND-DOMAIN/"
};
```

`DRIVE_FOLDER_ID` is optional. If it is blank, Drive fallback uploads are disabled and the backend rejects an image that cannot safely fit in the request.

`FRONTEND_BASE_URL` must point to the folder where the public frontend is hosted. Keep the trailing `/`.

Example:

```javascript
FRONTEND_BASE_URL:"https://example.github.io/visiting-card/"
```

## 3. Create the Google Drive image folder

1. Create a folder in Google Drive.
2. Copy its folder ID from the URL.
3. Put that ID into `DRIVE_FOLDER_ID`.
4. The Apps Script deployment owner must have access to this folder.

The backend sets uploaded files to `ANYONE_WITH_LINK` so the card can display the image publicly.

If your Google Workspace administrator blocks public Drive sharing, use another public image host or change the deployment/storage policy.

## 4. Deploy the backend

In Apps Script:

1. Click `Deploy`.
2. Select `New deployment`.
3. Type: `Web app`.
4. Execute as: `Me`.
5. Who has access: `Anyone`.
6. Deploy.
7. Authorize the requested permissions.
8. Copy the Web App URL ending in `/exec`.

It will look similar to:

```text
https://script.google.com/macros/s/DEPLOYMENT_ID/exec
```

Do not use the `/dev` URL for production.

## 5. Configure the frontend

Open:

```text
public/script.js
```

Set:

```javascript
const CONFIG={
  API_URL:"https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
};
```

The card and success pages also use this setting. Set the same URL in:

```text
public/card/script.js
public/success/script.js
```

Then set the same `FRONTEND_BASE_URL` in the backend.

## 6. How the image flow works

Images are processed in the browser first.

1. The original image is decoded.
2. It is resized to a maximum dimension.
3. JPEG/WebP compression is attempted.
4. The compressed image is converted to a data URL.
5. Normal-sized images are stored directly in the Sheet as data URLs.
6. If the resulting image is above the configured inline limit, it is sent as base64 to Apps Script.
7. Apps Script saves it into the configured Drive folder.
8. The returned public Drive URL is stored in the Sheet.

For production use, Drive fallback is preferred for large images because Google Sheets cells have size limits.

## 7. Local testing

A `file://` URL can cause browser security/CORS issues with the Apps Script endpoint. Use a local HTTP server.

From the `public` folder:

### Python

```bash
python -m http.server 5500
```

Open:

```text
http://localhost:5500/
```

### VS Code

Install Live Server and open `public/index.html` using Live Server.

## 8. Production hosting

Because the frontend is static, it can be hosted on:

- GitHub Pages
- Netlify
- Cloudflare Pages
- Firebase Hosting
- Any normal HTTPS web server

The generated card URL is:

```text
FRONTEND_BASE_URL + "card/?guid=" + GUID
```

The success URL is:

```text
FRONTEND_BASE_URL + "success/?guid=" + GUID
```

## 9. API

### Submit

```http
POST https://YOUR_APPS_SCRIPT_URL/exec
Content-Type: application/json
```

Body:

```json
{
  "action":"submit",
  "name":"Jane Doe",
  "title":"Professor",
  "instituteName":"Example Institute",
  "tagline":"Computer Science Department",
  "address":"Bengaluru, Karnataka",
  "website":"https://example.com",
  "phone":"+919999999999",
  "whatsapp":"+919999999999",
  "emails":"jane@example.com",
  "logoImage":{"name":"logo.png","type":"image/png","data":"data:image/png;base64,..."},
  "photoImage":{"name":"photo.jpg","type":"image/jpeg","data":"data:image/jpeg;base64,..."},
  "locationLink":"https://maps.google.com/?q=Bengaluru",
  "customLinks":"[{\"label\":\"LinkedIn\",\"url\":\"https://linkedin.com/in/example\"}]"
}
```

Response:

```json
{
  "success":true,
  "guid":"xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "cardUrl":"https://your-site.example/card/?guid=xxxxxxxx..."
}
```

### Card lookup

```text
GET https://YOUR_APPS_SCRIPT_URL/exec?action=card&guid=GUID
```

### Health check

```text
GET https://YOUR_APPS_SCRIPT_URL/exec?action=health
```

## 10. Google Sheets caching

The backend uses `CacheService.getScriptCache()`.

The cache key is:

```text
card:GUID
```

After a submission, the new card record is immediately cached. A later card lookup can therefore avoid a Sheet read.

The backend also uses a short cache for the sheet header setup.

## 11. Email behavior

The backend uses native `MailApp.sendEmail()`.

The first valid email address from the comma-separated email field receives a confirmation containing the generated card URL.

Email failures do not invalidate a successfully stored card. The API reports the card creation result separately from email delivery.

## 12. Security and deployment notes

This sample is intentionally serverless and simple, but it is not an identity-management system.

For a public production deployment consider adding:

- rate limiting
- CAPTCHA
- server-side abuse controls
- stricter URL allowlisting
- administrator authentication
- upload quotas
- audit logging
- a privacy policy
- deletion/update APIs
- an authenticated editing workflow

Do not put secrets or API keys in frontend JavaScript.

## 13. Troubleshooting

### `Configuration error`

Check `SPREADSHEET_ID`.

### Image upload fails

Check:

- `DRIVE_FOLDER_ID`
- Drive permissions
- public sharing restrictions
- image MIME type
- request size

### Card says not found

Check:

- GUID is present in the URL
- the frontend uses the current Apps Script `/exec` URL
- the Sheet contains the record
- deployment is the current version

### CORS/network error

Use an HTTPS static host or local HTTP server rather than opening the HTML file directly.

### QR code does not appear

The viewer loads `qrcode.min.js` from jsDelivr. Check the browser network connection. The card still shows the card URL even if QR generation fails.

## 14. Important production consideration

Google Sheets is being used as the database because that is the requested architecture. It is appropriate for a small/medium internal application, but it is not equivalent to a transactional database. For high-volume public traffic, move the storage layer to a database and keep Apps Script as an integration layer or replace it with a conventional API.
