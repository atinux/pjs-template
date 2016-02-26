<p align="center">
<img alt="PJS Template - An asynchronous templating engine" src="https://cloud.githubusercontent.com/assets/904724/12923917/869f1a00-cf4f-11e5-8db4-63cea9946e84.png"/>
</p>

<p align="center">
<a href="https://badge.fury.io/js/pjs-template"><img alt="npm version" src="https://badge.fury.io/js/pjs-template.svg"/></a> <a href="https://david-dm.org/Atinux/pjs-template"><img alt="Dependencies" src="https://david-dm.org/Atinux/pjs-template.svg"/></a> <a href="https://travis-ci.org/Atinux/pjs-template"><img alt="Build Status" src="https://travis-ci.org/Atinux/pjs-template.svg?branch=master"/></a>
<a href="https://codecov.io/github/Atinux/pjs-template?branch=master"><img alt="Code Coverage" src="https://codecov.io/github/Atinux/pjs-template/coverage.svg?branch=master"/></a>
</p>

An async rendering template engine used by [Pajamas](https://github.com/Atinux/pjs).
PJS syntax is based on [EJS](https://github.com/mde/ejs) and can handle asynchronous templates easily.

## Installation

`npm install pjs-template`

## Usage

```js
var pjs = require('pjs-template');

pjs.renderFile(path, data, options, function (err, html) { /* ... */ });
// or
pjs.render(str, data, options, function (err, html) { /* ... */ });
// or
var template = pjs.compile(str, options);
template(data, function (err, html) { /* ... */ });
```

With **Express.js**:
```js
app.engine('pjs', require('pjs-template').__express);
app.set('view engine', 'pjs');
// You can use 'view options' to set the pjs options
app.set('view options', {
  cache: true,
  delimiter: '$'
});
```

## Example

Template `hello.pjs`:
```js
<%
var foo = 'bar';
setTimeout(function () {
  foo = 'PJS';
  done(); // tell PJS it's an async block
}, 100);
%>
Hello <%= foo %>!
```

Render the file:
```js
var pjs = require('pjs-template');

pjs.renderFile('./hello.pjs', { foo: "bar" }, function (err, html) {
  console.log(html);
  // Display: Hello PJS!
});
```

The `done()` method tell PJS that it's an async block and to wait until done() is called.

If your block is not asynchronous, you don't need to use it:
```js
<% var foo = 'bar'; %>
Hello <%= foo %>!
```

Will display `Hello bar!`

## Options
- `cache` (boolean) - Compiled functions are cached, requires `filename` option when used with the `render` method
- `filename` - Used by cache to key caches, and for includes
- `watchFiles` (boolean) - Require `cache: true`, watch for changes on the cached files to clear their cache automatically
- `debug` - Output generated function body
- `compileDebug` - When false no debug instrumentation is compiled
- `delimiter` - Character to use with angle brackets for open/close
- `escapeFunction` - Custom function for escaping HTML

## Tags
- `<%` 'Scriptlet' tag, for control-flow, no output
- `<%=` Outputs the value into the template (HTML escaped)
- `<%-` Outputs the unescaped value into the template
- `<%#` Comment tag, no execution, no output
- `<%%` Outputs a literal '<%'
- `%>` Plain ending tag
- `-%>` Trim-mode ('newline slurp') tag, trims following newline

## Includes

Includes are relatives to the template with the `include` call.
```js
<% include ./hello.pjs %>
```

## Customer Delimiters

Custom delimiters can be applied on a per-template basis, or globally:

```js
var pjs = require('pjs-template'),
    users = ['geddy', 'neil', 'alex'];

// Just one template
pjs.render('<?= users.join(" | "); ?>', { users: users }, { delimiter: '?' }, function (err, html) {
  // html = 'geddy | neil | alex'
});

// Or globally
pjs.delimiter = '$';
pjs.render('<$= users.join(" | "); $>', { users: users }, function (err, html) {
  // html = 'geddy | neil | alex'
});
```

## Methods
- pjs.renderFile(path [, data] [, opts], callback)
- pjs.render(str [, data] [, opts], callback)
- pjs.compile(str [, opts])
- pjs.clearCache()
- pjs.escape(html)
