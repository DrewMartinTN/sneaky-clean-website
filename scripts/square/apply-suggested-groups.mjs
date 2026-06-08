#!/usr/bin/env node
import path from "node:path";
import { REPORT_DIR, addCustomerToGroup, listCustomerGroups, readCsv } from "./lib.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const fileArg = args.find((arg) => arg.endsWith(".csv"));
const file = fileArg || path.join(REPORT_DIR, `customer-audit-${new Date().toISOString().slice(0, 10)}.csv`);

const rows = readCsv(file);
const groups = await listCustomerGroups();
const groupIds = new Map(groups.map((group) => [group.name, group.id]));
let changes = 0;

for (const row of rows) {
  const suggestedGroups = String(row.suggested_groups || "")
    .split("|")
    .map((group) => group.trim())
    .filter(Boolean);

  for (const groupName of suggestedGroups) {
    const groupId = groupIds.get(groupName);
    if (!groupId) {
      console.log(`missing group "${groupName}" for ${row.customer_name}; run npm run square:setup-groups`);
      continue;
    }

    changes += 1;
    if (apply) {
      await addCustomerToGroup(row.customer_id, groupId);
      console.log(`added ${row.customer_name} -> ${groupName}`);
    } else {
      console.log(`dry-run ${row.customer_name} -> ${groupName}`);
    }
  }
}

console.log(apply
  ? `Applied ${changes} group assignment(s).`
  : `Dry run found ${changes} group assignment(s). Re-run with -- --apply to write to Square.`);
