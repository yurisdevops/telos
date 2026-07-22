/// <reference types="nativewind/types" />

// nativewind's own type package doesn't declare a `*.css` ambient module,
// so a plain `import './global.css'` side-effect import has nothing to
// resolve to under TypeScript 6's stricter side-effect import check.
declare module '*.css';
