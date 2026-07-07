function crmRowsToCsv(rows = []) {
  const header = ["rowId", "part", "stage", "task", "owner", "dueDate", "dependencyIds", "status", "exportCategory", "documentIntent", "templateId"];
  const esc = value => {
    const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [header.join(","), ...rows.map(row => header.map(key => esc(row[key])).join(","))].join("\n") + "\n";
}

module.exports = {
  crmRowsToCsv,
};
