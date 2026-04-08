const ExcelJS = require("exceljs");

function toIssueId(id) {
  return String(id || "")
    .slice(-8)
    .toUpperCase();
}

function formatDate(value) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toISOString();
}

function safe(value, fallback = "N/A") {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

async function generateComplaintReportAttachment(complaint, meta = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CiviQ";
  workbook.created = new Date();

  const issueId = toIssueId(complaint?._id);
  const generatedAt = new Date();

  const detailsSheet = workbook.addWorksheet("Complaint Details");
  detailsSheet.columns = [
    { header: "Field", key: "field", width: 28 },
    { header: "Value", key: "value", width: 64 },
  ];

  const rows = [
    ["Report Type", safe(meta.eventType, "status-update")],
    ["Issue ID", issueId],
    ["Complaint ID", safe(complaint?._id)],
    ["Status", safe(complaint?.status, "Pending")],
    ["Priority", safe(complaint?.priority, "Medium")],
    ["Category", safe(complaint?.category, "General")],
    ["Location", safe(complaint?.location)],
    ["Description", safe(complaint?.description)],
    ["Citizen Name", safe(complaint?.userId?.name)],
    ["Citizen Email", safe(complaint?.userId?.email)],
    ["Technician Name", safe(complaint?.technician?.name)],
    ["Technician Email", safe(complaint?.technician?.email)],
    ["Status Message", safe(meta.statusMessage, "N/A")],
    ["Resolution Details", safe(meta.resolutionDetails, "N/A")],
    ["Assigned At", formatDate(complaint?.assignedAt)],
    ["Resolved At", formatDate(complaint?.resolvedAt)],
    ["Created At", formatDate(complaint?.createdAt)],
    ["Updated At", formatDate(complaint?.updatedAt)],
    ["Generated At", formatDate(generatedAt)],
  ];

  rows.forEach(([field, value]) => detailsSheet.addRow({ field, value }));

  detailsSheet.getRow(1).font = { bold: true };
  detailsSheet.eachRow((row, rowNumber) => {
    row.alignment = { vertical: "top", wrapText: true };
    if (rowNumber > 1 && rowNumber % 2 === 0) {
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF8FAFC" },
      };
    }
  });

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 28 },
  ];

  summarySheet.addRows([
    { metric: "Issue ID", value: issueId },
    { metric: "Current Status", value: safe(complaint?.status, "Pending") },
    { metric: "Priority", value: safe(complaint?.priority, "Medium") },
    { metric: "Category", value: safe(complaint?.category, "General") },
    { metric: "Event Type", value: safe(meta.eventType, "status-update") },
  ]);

  summarySheet.getRow(1).font = { bold: true };

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    filename: `civiq-report-${issueId}-${safe(meta.eventType, "status-update")}.xlsx`,
    content: buffer,
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

module.exports = {
  generateComplaintReportAttachment,
};
