const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('viewport meta declares viewport-fit=cover', () => {
    const html = read('index.html');
    const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
    const viewport = metaTags.find(tag => /name\s*=\s*["']viewport["']/i.test(tag));
    assert.ok(viewport, 'Expected a viewport meta tag');
    assert.match(viewport, /viewport-fit\s*=\s*cover/i);
});

test('fixed top bars pad for iPhone safe-area insets', () => {
    const css = read('style.css');
    assert.match(css, /#turn-indicator-bar\s*{[^}]*env\(safe-area-inset-top\)/s);
    assert.match(css, /#gameContainer\s*{[^}]*env\(safe-area-inset-bottom\)/s);
});
