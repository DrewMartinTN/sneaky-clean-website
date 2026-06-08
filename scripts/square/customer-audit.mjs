#!/usr/bin/env node
import path from "node:path";
import { REPORT_DIR, buildCustomerAudit, todayStamp, writeCsv } from "./lib.mjs";

const rows = await buildCustomerAudit();
const file = path.join(REPORT_DIR, `customer-audit-${todayStamp()}.csv`);
writeCsv(file, rows);

console.log(`Wrote ${rows.length} customers to ${file}`);
const followUps = rows.filter((row) => row.suggested_follow_up_action !== "No immediate follow-up").length;
console.log(`${followUps} customers have suggested follow-up actions.`);
