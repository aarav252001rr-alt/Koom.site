/* KOOM — single configuration layer. Edit only this file. */
const API_CONFIG = {
  MUSIC_API_URL: "https://searchapi.koom.site",   // search, home, artist, album, lyrics…
  STREAM_API_URL: "https://dl.koom.site",          // playback only (POST /stream)
  API_KEY: "rowgxxmoduf47idhdjfg735hs",                         // sent as X-API-Key to the Downloader (visible in the browser — not a real secret)
  MUSIC_API_KEY: "admi@11xkoomsite"                    // only needed if the Music API has API_KEY set; harmless otherwise
};
// Optional: your own translation endpoint (same query format as translate.googleapis.com/translate_a/single). Empty = Google's.
API_CONFIG.TRANSLATE_URL = "";

/* ---- Who made it. Shown in About, Contact, the footer and the welcome screen. ---- */
const CREATOR = {
  name: "Ritesh",
  role: "Developer & designer",                     // optional, shown under your name in About
  bio: "I build simple, beautiful things for people who love music.",   // optional
  email: "contact@koom.site",
  /* Add as many accounts as you like. Same platform twice = two accounts. Leave a handle empty (or "YOUR_...") to hide it.
     `handle` can be a username ("koom.music"), "@koom.music" or a full link (https://…).
     type: instagram · youtube · github · x · telegram · whatsapp (number with country code) · linkedin · facebook · website */
  socials: [
    { type: "instagram", label: "Personal", handle: "https://instagram.com/r.it3s.h" },
    { type: "instagram", label: "Personal 2", handle: "https://instagram.com/r.ites.h_" },
    { type: "youtube",   label: "Channel",  handle: "https://youtube.com/@ritesh_yt011" },
    { type: "github",    handle: "" },
    { type: "x",         handle: "" },
    { type: "telegram",  handle: "" },
    { type: "whatsapp",  handle: "" },
    { type: "linkedin",  handle: "" },
    { type: "facebook",  handle: "" },
    { type: "website",   handle: "" }
  ]
};
const APP = { name: "KOOM.SITE", tagline: "Feel Every Beat.", version: "1.2.0", year: 2026, updated: "October 2026", website: "https://koom.site" };
    
