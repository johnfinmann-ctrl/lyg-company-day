import {mkdir, readFile, writeFile, copyFile} from 'node:fs/promises';

const files = ['app-icon-192.png', 'app-icon-512.png', 'app.webmanifest', 'balls-air-logo.png', 'course-original.png', 'install.js', 'lyg-logo.png', 'event.js', 'admin.js', 'admin.html', 'index.html'];
const assets = Object.fromEntries(await Promise.all(files.map(async name => [
  name, (await readFile('assets/' + name)).toString('base64')
])));
await mkdir('dist/server', {recursive: true});
await mkdir('dist/.openai', {recursive: true});
const source = await readFile('worker/index.mjs', 'utf8');
await writeFile('dist/server/index.js', 'const assets = ' + JSON.stringify(assets) + ';\n' + source);
await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
