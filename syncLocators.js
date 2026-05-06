const { Ableton } = require("ableton-js");

async function syncAndRenameLocators() {
  const ableton = new Ableton();

  try {
    console.log("Connecting to Ableton...");
    await ableton.start();

    const locators = await ableton.song.get("cue_points");
    const locatorData = [];

    // 1. Get raw data and sort
    for (const l of locators) {
      locatorData.push({
        ref: l, // Keep reference to the Ableton object to rename it later
        name: await l.get("name"),
        time: await l.get("time"),
      });
    }
    locatorData.sort((a, b) => a.time - b.time);

    console.log(`Calculating true time and renaming ${locators.length} locators...`);

    let totalSeconds = 0;
    let lastBeat = 0;
    const stepSize = 1.0;

    for (const loc of locatorData) {
      // --- Time Calculation Logic ---
      while (lastBeat < loc.time) {
        await ableton.song.set("current_song_time", lastBeat);
        await new Promise(r => setTimeout(r, 5)); // Faster polling
        const currentTempo = await ableton.song.get("tempo");
        const remainingBeats = Math.min(stepSize, loc.time - lastBeat);
        totalSeconds += (60 / currentTempo) * remainingBeats;
        lastBeat += remainingBeats;
      }

      // Format as MM:SS
      const mins = Math.floor(totalSeconds / 60);
      const secs = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
      const timeStamp = `${mins}:${secs}`;

      // --- Renaming Logic ---
      const originalName = loc.name;
      const parts = originalName.split("-");
      let newName = "";

      if (parts.length >= 3) {
        // Case: Two or more hyphens -> Embed between first and second hyphen
        // Part[0] - TIMESTAMP - Part[2...]
        const prefix = parts[0].trim();
        const suffix = parts.slice(2).join("-").trim();
        newName = `${prefix} - ${timeStamp} - ${suffix}`;
      } 
      else if (parts.length === 2) {
        const prefix = parts[0].trim();
        const suffix = parts[1].trim();

        if (suffix.length > 0) {
          // Case: One hyphen with text after -> Text - TIMESTAMP - Suffix
          newName = `${prefix} - ${timeStamp} - ${suffix}`;
        } else {
          // Case: One hyphen with NO text after -> Text - TIMESTAMP
          newName = `${prefix} - ${timeStamp}`;
        }
      } 
      else {
        // Case: Zero hyphens -> Add hyphen and TIMESTAMP
        newName = `${originalName.trim()} - ${timeStamp}`;
      }

      // Only update if the name actually changed to avoid API spam
      if (originalName !== newName) {
        await loc.ref.set("name", newName);
        console.log(`Updated: "${originalName}" -> "${newName}"`);
      } else {
        console.log(`Skipped: "${originalName}" (Already synced)`);
      }
    }

    console.log("\nSync Complete!");
    process.exit();
  } catch (error) {
    console.error("Critical Error:", error);
    process.exit(1);
  }
}

syncAndRenameLocators();