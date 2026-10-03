# Digital Visiting Card Creator v2.1.0

A static PWA frontend with Google Apps Script, Google Sheets and Google Drive storage.

## Project Structure

```text
Visiting_Card_v2.1.0/
├── backend/
│   ├── Code.gs
│   └── appsscript.json
├── public/
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   ├── manifest.json
│   ├── sw.js
│   ├── icons/
│   ├── create/
│   ├── card/
│   ├── saved/
│   ├── responses/
│   ├── viewer/
│   └── success/
└── README.md
```

## Features

- Create multiple digital visiting cards.
- Store card records in the `Cards` sheet.
- Store card ownership in `CardOwners` using `appId` and `guid`.
- Store company information in `CompanyMaster`.
- Store viewer submissions in `ViewerResponses`.
- Upload profile photos and logos to Google Drive.
- Responsive card view for desktop and mobile.
- Front/back 3D card flip.
- Card back includes a separate viewer-response QR code.
- Call, WhatsApp, email, website and map actions.
- Multiple email selection.
- Maps opens a directions URL when a Google Maps query is available.
- Save Contact downloads a vCard.
- Share Card uses native sharing when available and clipboard fallback otherwise.
- Saved Cards supports search, favourites, archive/unarchive and sharing.
- Viewer Responses supports search and card filtering.
- Local PWA support and local app ID generation.
- Local card draft persistence during card creation.

## Google Sheets

### Cards

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

### CompanyMaster

```text
companyId
companyName
tagline
address
website
logoUrl
locationLink
createdAt
updatedAt
status
description
```

### CardOwners

```text
appId
guid
createdAt
status
isFavourite
```

### ViewerResponses

```text
responseId
cardGuid
appId
viewerName
phone
whatsapp
email
company
message
createdAt
```

`CardOwners` and `ViewerResponses` are created automatically by the Apps Script backend when required.

## Backend Configuration

The supplied `backend/Code.gs` is configured for the current spreadsheet, Drive folder and Apps Script frontend URL used during development.

The frontend currently uses the active Apps Script `/exec` deployment configured in the frontend JavaScript files.

## Local Testing

Run the `public` directory through an HTTP server instead of opening files directly.

Example with Python:

```bash
cd public
python -m http.server 5500
```

Open:

```text
http://127.0.0.1:5500/
```

## Important

`appId` is a local bearer identifier used to associate cards with the current app installation. It is not a traditional authentication system.

GitHub Pages deployment can be done after local development and testing are complete.


## v2.1.0 card-view update
- Home button on every page
- Institute logo kept with institute details; profile photo is separate
- Tagline/Affiliation removed from the creation form
- Multiple email picker
- Custom-link More picker
- Front share QR and back viewer-response QR with card flip interaction
- CardOwners and ViewerResponses APIs

## Final v2.1.0 Feature Set
- Home/landing page with multi-card selection.
- Selected-card preview with institute logo and profile photo.
- Card view uses a real 3D front/back flip layout.
- Front QR opens/shares the digital vCard URL and flips to the back when clicked.
- Back QR opens the viewer-response form.
- Multiple email addresses open an email-selection modal.
- Multiple custom links are grouped under a More button and selection modal.
- Phone, WhatsApp, Email, Website, Maps and More actions are supported.
- Maps opens directions toward the stored card location.
- Save Card, Share Card and Save Contact are supported.
- Home button is available on every application page.
- Institute logo and profile photo are separate uploads in the create-card form.
- Tagline/Affiliation is not presented as a registration/create-card form field.
- Card ownership is stored in CardOwners and viewer submissions in ViewerResponses.
