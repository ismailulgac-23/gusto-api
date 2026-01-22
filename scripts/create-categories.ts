import fs from "fs";
import process from "process";
import path from "path";

const sql = fs.readFileSync(path.resolve('./prisma/categories.sql'), "utf8");

// INSERT bloğunu yakala
const insertMatch = sql.match(/INSERT INTO "categories"[\s\S]*?;/);
if (!insertMatch) {
  console.error("INSERT INTO categories bulunamadı");
  process.exit(1);
}

const valuesPart = insertMatch[0]
  .replace(/INSERT INTO "categories"[\s\S]*?VALUES/i, "")
  .replace(/;$/, "")
  .trim();

// Satırları ayır
const rows = valuesPart
  .split(/\),\s*\(/)
  .map(r => r.replace(/^\(|\)$/g, ""));

// Kolonlar (INSERT sırasına göre)
const columns = [
  "id",
  "name",
  "icon",
  "questions",
  "parentId",
  "commissionRate",
  "isActive",
  "createdAt",
  "updatedAt"
];

const data = rows.map((row: any) => {
  const values: any = [];
  let current = "";
  let inString = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === "'" && row[i - 1] !== "\\") {
      inString = !inString;
      current += char;
    } else if (char === "," && !inString) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  const obj: any = {};
  columns.forEach((col, i) => {
    let val = values[i];

    if (!val || val === "NULL") {
      obj[col] = null;
    } else if (val.startsWith("'")) {
      val = val.slice(1, -1);
      if (col === "questions" && val !== "null") {
        try {
          obj[col] = JSON.parse(val);
        } catch {
          obj[col] = val;
        }
      } else if (col === "isActive") {
        obj[col] = val === "1";
      } else {
        obj[col] = val;
      }
    } else if (!isNaN(val)) {
      obj[col] = Number(val);
    } else {
      obj[col] = val;
    }
  });

  return obj;
});

fs.writeFileSync(path.resolve('./prisma/categories.json'), JSON.stringify(data, null, 2));
console.log("✅ categories.json oluşturuldu");
