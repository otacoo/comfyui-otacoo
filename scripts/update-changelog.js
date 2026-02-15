const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pkgPath = path.join(root, "package.json");
const changelogPath = path.join(root, "CHANGELOG.md");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const version = pkg.version;
const date = new Date().toISOString().slice(0, 10);

const section = `## [${version}] - ${date}\n\n`;

let content;
if (fs.existsSync(changelogPath)) {
  content = fs.readFileSync(changelogPath, "utf8");
  if (content.includes(`## [${version}]`)) process.exit(0);
  content = section + content;
} else {
  content = section;
}

fs.writeFileSync(changelogPath, content, "utf8");
console.log("Updated CHANGELOG.md for v" + version);
