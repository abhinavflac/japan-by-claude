// Concatenates src/js/*.js into the page template and writes two outputs:
//   index.html          standalone document for local use
//   dist/artifact.html  body fragment for publishing (the host adds the document skeleton)
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const jsDir = path.join(root, 'src', 'js');
const parts = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort();
const js = parts.map(f => `// ---- ${f} ----\n` + fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n');
const page = fs.readFileSync(path.join(root, 'src', 'page.html'), 'utf8').replace('/*__JS__*/', () => js);

const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
</head>
<body>
${page}
</body>
</html>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'index.html'), standalone);
fs.writeFileSync(path.join(root, 'dist', 'artifact.html'), page);
console.log(`built ${parts.length} parts, ${(page.length / 1024).toFixed(1)} KB`);
