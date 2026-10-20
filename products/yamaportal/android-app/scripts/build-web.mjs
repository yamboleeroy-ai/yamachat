import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productRoot = path.resolve(appRoot, '..');
const source = path.join(productRoot, 'preview', 'dist');
const output = path.join(appRoot, 'www');
fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(source, output, { recursive: true });
const indexPath = path.join(output, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace('<link rel="stylesheet" href="style.css">', '<link rel="stylesheet" href="style.css"><link rel="stylesheet" href="yamaportal-mobile.css">');
html = html.replace('<script src="vendor/supabase.js"></script>', '<script src="native-bridge.js"></script><script src="vendor/supabase.js"></script>');
fs.writeFileSync(indexPath, html);
fs.copyFileSync(path.join(appRoot, 'android-app.css'), path.join(output, 'yamaportal-mobile.css'));
fs.copyFileSync(path.join(appRoot, 'assets', 'icon.png'), path.join(output, 'yamaportal-android-icon.png'));
console.log(`Portal web package prepared for Android (${fs.readdirSync(output).length} root files).`);
