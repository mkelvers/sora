# braces, patched

A copy of `braces@3.0.3` (MIT, Jon Schlinkert) with one change: `lib/parse.js`
throws a `SyntaxError` once braces nest more than 64 deep.

Upstream's 10,000-character input cap still allows about 5,000 nested braces,
enough to exhaust the stack (GHSA-vfj7-8cjw-p6xm), and no patched release
exists. It is numbered 3.0.4 so audits see it is past the affected range, and
the root `package.json` overrides `braces` to it.

Drop this copy once `braces` publishes a fixed release.
