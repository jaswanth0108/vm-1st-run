const fs = require('fs');
const html = fs.readFileSync('admin/index.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);

if (scriptMatch) {
    const code = scriptMatch[1];
    try {
        new Function(code);
        console.log('Syntax is valid');
    } catch(e) {
        console.log('Syntax error:', e);
    }
}
