const _process = typeof process == "undefined" ? {} : process || {};

if (_process.env && _process.env.NODE_ENV === "production") {
  module.exports = require("./dist/index.min.js");
} else {
  module.exports = require("./dist/index.js");
}
