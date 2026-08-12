const defineConfig_pkg = require(String.fromCharCode(118,105,116,101));
const react_pkg = require(String.fromCharCode(64,118,105,116,101,106,115,47,112,108,117,103,105,110,45,114,101,97,99,116));

const defineConfig = defineConfig_pkg.defineConfig;
const react = react_pkg.default || react_pkg;

module.exports = defineConfig({
  plugins: [react()],
});
