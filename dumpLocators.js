const { Ableton } = require("ableton-js");
const fs = require("fs");
const path = require("path");

async function accurateDumpToFile() {
  const ableton = new Ableton();

  try {
    console.log("Connecting to Ableton...");
    await ableton.start();

    const locators = await ableton.song.get("cue_points");
    const results = [];

    // 1. Get all locators and sort them chronologically
    const locatorData = await Promise.all(
      locators.map(async (l) => ({
        name: await l.get("name"),
        time: await l.get("time"),
      }))
    );
    locatorData.sort((a, b) => a.time - b.time);

    console.log(`Sampling tempo map for ${locators.length} locators...`);

    let totalSeconds = 0;
    let lastBeat = 0;
    const stepSize = 1.0; // Sample every 1 beat for accuracy

    for (const loc of locatorData) {
      // Step through the timeline to calculate elapsed time
      while (lastBeat < loc.time) {
        await ableton.song.set("current_song_time", lastBeat);
        
        // Minimal delay to let the API return the tempo for this specific beat
        await new Promise(r => setTimeout(r, 10)); 
        
        const currentTempo = await ableton.song.get("tempo");
        
        const remainingBeats = Math.min(stepSize, loc.time - lastBeat);
        totalSeconds += (60 / currentTempo) * remainingBeats;
        
        lastBeat += remainingBeats;
      }

      const mins = Math.floor(totalSeconds / 60);
      const secs = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
      const ms = Math.floor((totalSeconds % 1) * 100).toString().padStart(2, '0');
      const timecode = `${mins}:${secs}.${ms}`;

      results.push({
        name: loc.name,
        beats: loc.time.toFixed(2),
        timecode: timecode,
        seconds: totalSeconds.toFixed(3)
      });

      console.log(`✓ Calculated: ${loc.name} -> ${timecode}`);
    }

    // 2. Format the data for the log file
    let logContent = "ABLETON LOCATOR EXPORT (TRUE RULER TIME)\n";
    logContent += "Generated on: " + new Date().toLocaleString() + "\n";
    logContent += "------------------------------------------------------------\n";
    logContent += "TIMECODE    | BEATS    | SECONDS  | NAME\n";
    logContent += "------------------------------------------------------------\n";

    results.forEach(r => {
      logContent += `${r.timecode.padEnd(11)} | ${r.beats.padEnd(8)} | ${r.seconds.padEnd(8)} | ${r.name}\n`;
    });

    // 3. Save to file
    const filePath = path.join(__dirname, "locator_log.txt");
    fs.writeFileSync(filePath, logContent);

    console.log("\n------------------------------------------------------------");
    console.log(`SUCCESS: Log saved to ${filePath}`);
    console.log("------------------------------------------------------------\n");
    
    process.exit();
  } catch (error) {
    console.error("Critical Error:", error);
    process.exit(1);
  }
}

accurateDumpToFile();