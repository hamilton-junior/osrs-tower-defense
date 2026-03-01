const https = require("https");
const fs = require("fs");

const file1 = fs.readFileSync("lib/game/engine.ts", "utf8");
const file2 = fs.readFileSync("components/GameCanvas.tsx", "utf8");
const urls1 =
  file1.match(/https:\/\/oldschool.runescape.wiki\/images\/[^'"`]+/g) || [];
const urls2 =
  file2.match(/https:\/\/oldschool.runescape.wiki\/images\/[^'"`]+/g) || [];
const allUrls = [...new Set([...urls1, ...urls2])].filter(
  (u) => !u.includes("${"),
);

console.log("Found " + allUrls.length + " URLs to test.");
let tested = 0;
let results = {};

allUrls.forEach((url) => {
  https
    .get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
      },
      (res) => {
        if (!results[res.statusCode]) results[res.statusCode] = [];
        results[res.statusCode].push(url);

        tested++;
        if (tested === allUrls.length) {
          Object.keys(results).forEach((code) => {
            console.log(`\nStatus ${code} (${results[code].length} URLs):`);
            if (code !== "200") {
              results[code].forEach((u) => console.log(u));
            }
          });
        }
      },
    )
    .on("error", (e) => {
      if (!results["ERROR"]) results["ERROR"] = [];
      results["ERROR"].push(url);
      tested++;
      if (tested === allUrls.length) {
        Object.keys(results).forEach((code) => {
          console.log(`\nStatus ${code} (${results[code].length} URLs):`);
          if (code !== "200") {
            results[code].forEach((u) => console.log(u));
          }
        });
      }
    });
});
