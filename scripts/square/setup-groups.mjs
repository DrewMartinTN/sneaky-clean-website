#!/usr/bin/env node
import path from "node:path";
import { ROOT, EXPORT_DIR, createCustomerGroup, ensureDir, listCustomerGroups, readJson } from "./lib.mjs";
import fs from "node:fs";

const groupConfig = readJson(path.join(ROOT, "growth", "customer-groups.json"));
const desiredNames = groupConfig.map((group) => group.name);

const existing = await listCustomerGroups();
const byName = new Map(existing.map((group) => [group.name, group]));
const finalGroups = [];

for (const name of desiredNames) {
  if (byName.has(name)) {
    finalGroups.push(byName.get(name));
    console.log(`exists  ${name}`);
  } else {
    const created = await createCustomerGroup(name);
    finalGroups.push(created);
    console.log(`created ${name}`);
  }
}

ensureDir(EXPORT_DIR);
const map = Object.fromEntries(finalGroups.map((group) => [group.name, group.id]));
fs.writeFileSync(path.join(EXPORT_DIR, "square-group-map.json"), `${JSON.stringify(map, null, 2)}\n`);
console.log(`\nSaved group IDs to growth/exports/square-group-map.json`);
