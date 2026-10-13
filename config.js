/* KOOM — single configuration layer. Edit only this file. */
const API_CONFIG = {
  MUSIC_API_URL: "https://api.koom.site",   // search, home, artist, album, lyrics…
  STREAM_API_URL: "https://dl.koom.site",          // playback only (POST /stream)
  API_KEY: "rowgxxmoduf47idhdjfg735hs",                         // sent as X-API-Key to the Downloader (visible in the browser — not a real secret)
  MUSIC_API_KEY: "kehgidbeoxh6347hdnibdiejhp"                    // only needed if the Music API has API_KEY set; harmless otherwise
};
API_CONFIG.TRANSLATE_URL = "";
const CREATOR = {
  name: "Ritesh",
  instagram: "https://instagram.com/@r.it3s.h/",   // handle or full URL
  github: "",
  youtube: "https://youtube.com/@ritesh_yt011",
  x: "",
  email: ""
};
const APP = { name: "KOOM.SITE", tagline: "Feel Every Beat.", version: "1.0.0", year: 2026 };
