import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readSite } from './helpers.mjs';

function navigation() {
  const handlers = {};
  const heading = { setAttribute(k, v) { this[k] = v; }, focus(options) { this.focused = options; } };
  const summary = { focus() { this.focused = true; } };
  const links = ['workflow', 'features', 'memory', 'profiles', 'getting-started'].map((id) => ({
    hash: `#${id}`, addEventListener(type, fn) { this[type] = fn; },
  }));
  const menu = {
    open: true,
    querySelectorAll() { return links; },
    querySelector() { return summary; },
    addEventListener(type, fn) { handlers[type] = fn; },
  };
  const document = { getElementById(id) { return id === 'mobile-menu' ? menu : { querySelector() { return heading; } }; } };
  const script = readSite('src', 'components', 'Nav.astro').match(/<script is:inline>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'mobile menu enhancement missing');
  const frames = [];
  runInNewContext(script, { document, requestAnimationFrame: (fn) => frames.push(fn) });
  return { menu, links, heading, summary, handlers, frames };
}

test('every mobile anchor closes the menu and focuses the destination without overriding scrolling', () => {
  const { menu, links, heading, frames } = navigation();
  for (const link of links) {
    menu.open = true;
    link.click();
    assert.equal(menu.open, false, link.hash);
    assert.equal(heading.tabindex, '-1');
    assert.equal(frames.length, 1, 'focus waits until native anchor navigation finishes');
    frames.shift()();
    assert.equal(heading.focused.preventScroll, true);
  }
});

test('Escape closes the menu and returns focus to its summary; other keys leave it open', () => {
  const { menu, summary, handlers } = navigation();
  handlers.keydown({ key: 'Tab' });
  assert.equal(menu.open, true);
  handlers.keydown({ key: 'Escape' });
  assert.equal(menu.open, false);
  assert.equal(summary.focused, true);
});
