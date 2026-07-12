import fs from "fs";
const c = fs.readFileSync("components/Header.tsx","utf8");
const lines = c.split("\n");
// Find the tab array
for (let i = 390; i < 410; i++) {
  console.log((i+1) + ": [" + lines[i] + "]");
}
