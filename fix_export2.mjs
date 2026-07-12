import fs from "fs";
let c = fs.readFileSync("components/Header.tsx","utf8");
c = c.replace(
  '                  Save diagram to\n                </div>',
  '                <div className="px-2.5 py-1 text-[10px] font-medium text-zinc-500">\n                  Save diagram to\n                </div>'
);
fs.writeFileSync("components/Header.tsx", c, "utf8");
