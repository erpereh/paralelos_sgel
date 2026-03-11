import xlsx from "xlsx";
import fs from "fs";

async function main() {
  console.log("Analyzing Excel file...");
  try {
    const workbook = xlsx.readFile("conceptos_meta4.xlsx");
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    console.log("Headers found:", data[0]);
  } catch (err) {
    console.error("Error reading Excel:", err.message);
  }

  const N8N_URL = "http://localhost:5678";

  console.log("Fetching workflow nkVsacaxJsVZr9nN from N8N...");
  const res = await fetch(`${N8N_URL}/api/v1/workflows/nkVsacaxJsVZr9nN`, {
    headers: {
      "X-N8N-API-KEY": "none" // n8n doesn't strictly check if auth is off
    }
  });

  if (!res.ok) {
    console.error("Failed to fetch workflow:", await res.text());
    return;
  }

  const workflow = await res.json();
  fs.writeFileSync("workflow_backup.json", JSON.stringify(workflow, null, 2));
  console.log("Saved workflow_backup.json");
}

main();
