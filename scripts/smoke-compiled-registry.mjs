import { stdout } from "node:process";
import { resolveProfile } from "@tonalli-memo/registry";

const profile = resolveProfile("xa");

if (profile?.alias !== "xolosarmy.xec") {
  throw new Error(`Expected xa to resolve to xolosarmy.xec, received ${profile?.alias ?? "null"}.`);
}

stdout.write(`compiled registry smoke ok: xa -> ${profile.alias}\n`);
