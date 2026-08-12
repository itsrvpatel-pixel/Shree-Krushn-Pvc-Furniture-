const defineConfig_pkg = require(String.fromCharCode(118,105,116,101));
const react_pkg = require(String.fromCharCode(64,118,105,116,101,106,115,47,112,108,117,103,105,110,45,114,101,97,99,116));

const defineConfig = defineConfig_pkg.defineConfig;
const react = react_pkg.default || react_pkg;

const CURLY_DOUBLE_OPEN = String.fromCharCode(8220);
const CURLY_DOUBLE_CLOSE = String.fromCharCode(8221);
const CURLY_SINGLE_OPEN = String.fromCharCode(8216);
const CURLY_SINGLE_CLOSE = String.fromCharCode(8217);
const STRAIGHT_DOUBLE = String.fromCharCode(34);
const STRAIGHT_SINGLE = String.fromCharCode(39);
const ELLIPSIS_CHAR = String.fromCharCode(8230);
const THREE_DOTS = String.fromCharCode(46, 46, 46);

function fixSmartQuotesPlugin() {
  return {
    name: String.fromCharCode(102,105,120,45,115,109,97,114,116,45,113,117,111,116,101,115),
    enforce: String.fromCharCode(112,114,101),
    transform: function (code, id) {
      const isJsLike = id.indexOf(String.fromCharCode(46,106,115,120)) !== -1 || id.indexOf(String.fromCharCode(46,106,115)) !== -1;
      if (!isJsLike) return null;
      let fixed = code.split(CURLY_DOUBLE_OPEN).join(STRAIGHT_DOUBLE);
      fixed = fixed.split(CURLY_DOUBLE_CLOSE).join(STRAIGHT_DOUBLE);
      fixed = fixed.split(CURLY_SINGLE_OPEN).join(STRAIGHT_SINGLE);
      fixed = fixed.split(CURLY_SINGLE_CLOSE).join(STRAIGHT_SINGLE);
      fixed = fixed.split(ELLIPSIS_CHAR).join(THREE_DOTS);
      if (fixed === code) return null;
      return { code: fixed, map: null };
    },
  };
}

module.exports = defineConfig({
  plugins: [fixSmartQuotesPlugin(), react()],
});
