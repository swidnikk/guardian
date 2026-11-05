// Unit check for the GitHub folder link (it is rendered unescaped with {{{ }}}): only http(s), every segment encoded, else ''.
import assert from 'node:assert/strict';
import { repoLink } from '../render.js';
const ok = repoLink({ url: 'https://github.com/o/r/', branch: 'feat/x y' }, 'Dovu/a "b"<c>');
assert.equal(ok, 'https://github.com/o/r/tree/feat/x%20y/Methodology%20Library/Dovu/a%20%22b%22%3Cc%3E');
for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc', '', 'not a url']) assert.equal(repoLink({ url: bad, branch: 'main' }, 'a'), '', bad);
assert.equal(repoLink({ url: 'https://github.com/o/r?"onmouseover=1#x', branch: 'main' }, 'a'), 'https://github.com/o/r/tree/main/Methodology%20Library/a');
console.log('PASS catalog.unit');
