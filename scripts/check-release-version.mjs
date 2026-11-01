import { appendFileSync, readFileSync } from 'node:fs';

// Resolve paths relative to this script, including when run outside the repository.
const root = new URL('../', import.meta.url);
const config = JSON.parse(readFileSync(new URL('src-tauri/tauri.conf.json', root), 'utf8'));
const cargo = readFileSync(new URL('src-tauri/Cargo.toml', root), 'utf8');
const packageSection = cargo.split(/^\[package\]\s*$/m)[1]?.split(/^\[/m)[0];
const cargoVersion = packageSection?.match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1];
const tag = process.argv[2] ?? (process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined);
const version = config.version;

if (!version || !cargoVersion || version !== cargoVersion) {
  throw new Error(`Version mismatch: tauri.conf.json=${version}, Cargo.toml=${cargoVersion}`);
}
if (tag !== undefined && (!tag.startsWith('v') || tag.slice(1) !== version)) {
  throw new Error(`Tag ${tag} must be v${version}`);
}
console.log(`Release version ${version}${tag ? ` matches ${tag}` : ' matches both files'}`);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
}
