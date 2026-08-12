import { defineConfig } from ‘vite’;
import react from ‘@vitejs/plugin-react’;

// Some mobile text editors (iOS Safari/GitHub app) convert straight quotes
// (” ‘) to “smart” curly quotes (” “ ’ ‘) when text is typed or pasted into
// their text fields. This breaks JS syntax, since import statements require
// literal straight-quoted strings. This plugin runs before esbuild parses
// the code and converts any curly quotes back to straight ones, so files
// edited from a phone keep working even if the mobile editor corrupts them.
function fixSmartQuotes() {
return {
name: ‘fix-smart-quotes’,
enforce: ‘pre’,
transform(code, id) {
if (!id.endsWith(’.jsx’) && !id.endsWith(’.js’)) return null;
const fixed = code
.replace(/[\u201C\u201D]/g, ‘”’)
.replace(/[\u2018\u2019]/g, “’”);
if (fixed === code) return null;
return { code: fixed, map: null };
},
};
}

export default defineConfig({
plugins: [fixSmartQuotes(), react()],
});