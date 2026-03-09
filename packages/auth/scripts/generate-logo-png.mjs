#!/usr/bin/env node
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const svgPath = path.join(__dirname, "../assets/logo.svg");
const pngPath = path.join(__dirname, "../assets/logo.png");

const svg = fs.readFileSync(svgPath);
await sharp(svg).resize(96, 96).png().toFile(pngPath);
console.log("Generated", pngPath);
