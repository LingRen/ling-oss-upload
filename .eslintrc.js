module.exports = {
  parserOptions: {
    parser: "babel-eslint",
    sourceType: "module"
  },
  env: {
    browser: true,
    es6: true
  },
  extends: [
    "plugin:vue/essential",
    "plugin:prettier/recommended"
  ],
  plugins: [
    "html",
    "vue"
  ],
  // add your custom rules here
  rules: {
    "prettier/prettier": "error",
    // allow async-await
    "generator-star-spacing": "off",
    // allow debugger during development
    "no-debugger": process.env.NODE_ENV === "production" ? "error" : "off"
  }
}