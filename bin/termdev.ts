#!/usr/bin/env bun

import { run } from "../src/main.ts";

await run(Bun.argv.slice(2));
