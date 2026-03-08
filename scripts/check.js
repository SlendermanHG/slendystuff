const fs = require("fs");

const files = ["data/settings.json"];

const secretsCandidate = fs.existsSync("data/secrets.json")
  ? "data/secrets.json"
  : "data/secrets.example.json";

files.push(secretsCandidate);

for (const file of files) {
  JSON.parse(fs.readFileSync(file, "utf8"));
}

const jsFiles = [
  "public/shared.js",
  "public/site.js",
  "public/support.js",
  "public/product.js",
  "public/admin/admin.js"
];

for (const file of jsFiles) {
  new Function(fs.readFileSync(file, "utf8"));
}

console.log("Sanity checks passed.");
