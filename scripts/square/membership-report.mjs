#!/usr/bin/env node
import path from "node:path";
import { ROOT, REPORT_DIR, daysSince, readCsv, todayStamp, writeCsv } from "./lib.mjs";

const file = path.join(ROOT, "growth", "private", "memberships.csv");
const members = readCsv(file).filter((member) => member.member_name);
const rows = members.map((member) => {
  const nextDate = member.next_eligible_service_date || "";
  const today = new Date(todayStamp());
  const next = nextDate ? new Date(nextDate) : null;
  const daysUntilEligible = next && !Number.isNaN(next.getTime())
    ? Math.ceil((next.getTime() - today.getTime()) / 86400000)
    : "";

  return {
    ...member,
    days_since_last_service: daysSince(member.last_service_date),
    days_until_eligible: daysUntilEligible,
    suggested_action: daysUntilEligible === "" || daysUntilEligible <= 0
      ? "Eligible for monthly service"
      : "Not eligible yet",
  };
});

const reportFile = path.join(REPORT_DIR, `membership-report-${todayStamp()}.csv`);
writeCsv(reportFile, rows);

const due = rows.filter((row) => row.suggested_action === "Eligible for monthly service");
console.log(`Wrote ${rows.length} member(s) to ${reportFile}`);
console.log(`${due.length} member(s) are eligible for monthly service.`);
