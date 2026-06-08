#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { REPORT_DIR, buildCustomerAudit, isMaintenanceMember, todayStamp, writeCsv } from "./lib.mjs";

const rows = await buildCustomerAudit();
const stamp = todayStamp();

const inactive60 = rows.filter((row) => Number(row.days_since_last_service) >= 60);
const inactive90 = rows.filter((row) => Number(row.days_since_last_service) >= 90);
const maintenanceOffers = rows.filter((row) => (
  Number(row.total_visits) >= 2 &&
  !isMaintenanceMember(row.groups)
));
const ceramicCheckins = rows.filter((row) => (
  row.groups.includes("Ceramic Customer") &&
  Number(row.days_since_last_service) >= 120
));
const repeatNoMembership = maintenanceOffers;
const missingContact = rows.filter((row) => !row.email || !row.phone);

const actionRows = rows.filter((row) => row.suggested_follow_up_action !== "No immediate follow-up");
writeCsv(path.join(REPORT_DIR, `follow-up-actions-${stamp}.csv`), actionRows);

function table(title, sectionRows, columns = ["customer_name", "phone", "email", "days_since_last_service", "suggested_follow_up_action"]) {
  const lines = [`## ${title}`, ""];
  if (!sectionRows.length) {
    lines.push("None found.", "");
    return lines.join("\n");
  }

  lines.push(`| ${columns.join(" | ")} |`);
  lines.push(`| ${columns.map(() => "---").join(" | ")} |`);
  for (const row of sectionRows.slice(0, 50)) {
    lines.push(`| ${columns.map((column) => String(row[column] || "").replaceAll("|", "\\|")).join(" | ")} |`);
  }
  if (sectionRows.length > 50) lines.push(`\nShowing first 50 of ${sectionRows.length}. See CSV for full list.`);
  lines.push("");
  return lines.join("\n");
}

const markdown = [
  `# Sneaky Clean Retention Report - ${stamp}`,
  "",
  `Customers audited: ${rows.length}`,
  `Follow-up actions: ${actionRows.length}`,
  "",
  table("Customers Inactive 60+ Days", inactive60),
  table("Customers Inactive 90+ Days", inactive90),
  table("Offer Monthly Maintenance", maintenanceOffers, ["customer_name", "phone", "email", "total_visits", "last_service_date", "services_purchased"]),
  table("Ceramic Customers Due For Check-In", ceramicCheckins),
  table("Repeat Customers Not In Membership", repeatNoMembership, ["customer_name", "phone", "email", "total_visits", "total_spend", "services_purchased"]),
  table("Customers Missing Phone Or Email", missingContact, ["customer_name", "phone", "email", "total_visits", "last_service_date"]),
  "## Sending Follow-Ups",
  "",
  `Use growth/reports/follow-up-actions-${stamp}.csv as the working list. Send messages through Square Messages, email, or manual text, then add or remove the Needs Follow-Up group in Square.`,
  "",
].join("\n");

const reportFile = path.join(REPORT_DIR, `retention-report-${stamp}.md`);
fs.writeFileSync(reportFile, markdown);
console.log(`Wrote ${reportFile}`);
console.log(`Wrote ${path.join(REPORT_DIR, `follow-up-actions-${stamp}.csv`)}`);
