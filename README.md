# Pilsen Bike Share PWA

> ⚠️ Vibecoded slop

A simple Progressive Web App to monitor bike availability at your favorite Pilsen bike sharing stations.

## Features

- **Favorite stations** - Add/remove your most-used bike stations
- **Live updates** - Auto-refreshes every 60 seconds when the app is open
- **Offline support** - Works offline with cached data (PWA)
- **Mobile-friendly** - Install as a PWA on your phone
- **Persistent storage** - Favorites saved in localStorage

## Usage

1. Open `index.html` in a browser (or serve via any static server)
2. Tap the **+** button to add favorite stations
3. Search for stations by name or address
4. View real-time bike and dock counts
5. Tap **×** on a station to remove it from favorites

## Install as PWA

### Android (Chrome)
1. Open the app in Chrome
2. Tap the menu (⋮) → "Install app" or "Add to Home screen"

### iOS (Safari)
1. Open the app in Safari
2. Tap Share → "Add to Home Screen"

## Running the App

**The app must be served over HTTP** — service workers and fetch API don't work on `file://`.

### Start the server

```bash
cd bikeshare
python3 server.py
```

Then open `http://localhost:8080` in your browser.

### Install as PWA

- **Android (Chrome):** Menu → "Install app" or "Add to Home screen"
- **iOS (Safari):** Share button → "Add to Home Screen"

### Access from phone on same network

The server prints your machine's IP. Open that URL on your phone:

```
http://YOUR_IP:8080
```

## API

Data is fetched from the PMDP Freebike GBFS v3.0 API:
- `https://pmdpbike.admin.freebike.com/api/gbfs/v30/station_information` (station list, names, capacity)
- `https://pmdpbike.admin.freebike.com/api/gbfs/v30/station_status` (live bike/dock counts)

Both are merged client-side; the status endpoint is keyed by `station_id`.

## Files

- `index.html` - Main HTML page
- `style.css` - Styles
- `app.js` - Application logic
- `sw.js` - Service Worker for PWA
- `manifest.json` - PWA manifest
