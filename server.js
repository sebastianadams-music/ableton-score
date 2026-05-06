const { Ableton } = require("ableton-js");
const express = require("express");
const basicAuth = require("express-basic-auth");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ableton = new Ableton();
const ANTICIPATION_BEATS = 4; 

app.use(basicAuth({
    users: { 'test': 'test' },
    challenge: true,
    realm: 'Luna Rehearsal Tool'
}));

app.use(express.static("public"));

let lastSentId = "";
let lastEmitTime = 0;

async function init() {
  try {
    console.log("Connecting to Ableton...");
    await ableton.start();
    console.log("Ableton Connection Started!");

    const locators = await ableton.song.get("cue_points");
    const locatorData = await Promise.all(
      locators.map(async (l) => ({
        name: await l.get("name"),
        time: await l.get("time"),
      }))
    );
    
    const sortedLocators = locatorData.sort((a, b) => a.time - b.time);
    console.log("Loaded Locators:", sortedLocators.map(l => l.name));

ableton.song.addListener("current_song_time", (time) => {
      const now = Date.now();
      
      // 1. REAL-TIME: Where the playhead actually is (for the Context Map highlight)
      const currentIndex = sortedLocators.findLastIndex((l) => time >= l.time);
      const rawCurrent = currentIndex !== -1 ? sortedLocators[currentIndex] : null;

      // 2. ANTICIPATED: 4 beats ahead (for Image, Instructions, and Name)
      const lookupTime = time + ANTICIPATION_BEATS;
      const anticipatedIndex = sortedLocators.findLastIndex((l) => lookupTime >= l.time);
      const rawAnticipated = anticipatedIndex !== -1 ? sortedLocators[anticipatedIndex] : null;
      
      // We use the anticipated name as our trigger for the "Section Change" event
      const antParts = rawAnticipated ? rawAnticipated.name.split("-").map(p => p.trim()) : [];
      const anticipatedId = antParts[0] || "none";

      // Trigger update based on the Anticipated ID
      if (anticipatedId !== lastSentId) {
        lastSentId = anticipatedId;
        
        // Build Context Map based on the REAL-TIME playhead position
        let contextString = "";
        if (rawCurrent) {
            const prefixMatch = (rawCurrent.name.split("-")[0].trim()).match(/^[a-zA-Z]+/);
            const songPrefix = prefixMatch ? prefixMatch[0] : ""; 
            
            if (songPrefix) {
                const songSections = sortedLocators.filter(l => l.name.startsWith(songPrefix));
                contextString = songSections.map((loc) => {
                    const sectionName = loc.name.split("-")[0].trim();
                    return (loc.time === rawCurrent.time) ? `*${sectionName}*` : sectionName;
                }).join(" ");
            }
        }

        const rawNext = (anticipatedIndex !== -1 && anticipatedIndex < sortedLocators.length - 1) 
                       ? sortedLocators[anticipatedIndex + 1] : null;

        const heavyData = {
          current: {
            id: anticipatedId, // Anticipated (4 beats early)
            timestamp: antParts[1] || "--:--",
            instructions: antParts.slice(2) || [],
            context: contextString // Real-time (Syncs with Context Map)
          },
          next: rawNext ? {
            id: rawNext.name.split("-")[0].trim(),
            instructions: rawNext.name.split("-").slice(2).join(" - ")
          } : null
        };
        
        io.emit("section_change", heavyData);
      }

      // --- STREAM 2: TIME UPDATES (Throttled) ---
      // We update the Context Map more frequently here so the red box 
      // moves exactly when the playhead crosses the marker line.
      if (now - lastEmitTime >= 400) {
        // Recalculate context string for the time update to keep the red box in sync
        let liveContext = "";
        if (rawCurrent) {
            const prefixMatch = (rawCurrent.name.split("-")[0].trim()).match(/^[a-zA-Z]+/);
            const songPrefix = prefixMatch ? prefixMatch[0] : ""; 
            if (songPrefix) {
                liveContext = sortedLocators
                    .filter(l => l.name.startsWith(songPrefix))
                    .map(l => (l.time === rawCurrent.time) ? `*${l.name.split("-")[0].trim()}*` : l.name.split("-")[0].trim())
                    .join(" ");
            }
        }

        const barsUntil = calculateBarsUntil(time, sortedLocators, currentIndex);
        
        io.emit("time_update", {
          time: time.toFixed(2),
          barsUntil: barsUntil,
          liveContext: liveContext // Send live context update with time stream
        });
        lastEmitTime = now;
      }
    });

  } catch (error) {
    console.error("Connection Error:", error.message);
    setTimeout(init, 2000);
  }
}

function calculateBarsUntil(time, sorted, currentIndex) {
  if (currentIndex === -1 || currentIndex >= sorted.length - 1) return 0;
  const nextLocator = sorted[currentIndex + 1];
  const beatsUntil = nextLocator.time - time;
  let bars = Math.ceil(beatsUntil / 4);
  return bars > 0 ? bars : 0;
}

init();

server.listen(3000, "0.0.0.0", () => {
  console.log("Server active at http://localhost:3000");
});