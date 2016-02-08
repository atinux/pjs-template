# Pajamas.js Template (pjs-template)

An async rendering template engine used by [Pajamas.js](https://github.com/Atinux/pjs).
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

With **Express.js (3 & 4)**:
```js
app.engine('pjs', require('pjs-template').__express);
app.set('view engine', 'pjs');
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

pjs.renderFile('./template.pjs', { foo: "bar" }, function (err, html) {
  console.log(html);
  // Display: Hello PJS!
});
```

The `done()` method tell PJS that it's an async block and to wait until done() is called.

## Options
- `cache` (boolean) - Compiled functions are cached, requires `filename` option when used with the `render` method
- `filename` - Used by cache to key caches, and for includes
- `watchFiles` (boolean) - Require `cache: true`, watch for changes on the cached files to clear their cache
- `context` - Function execution context
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
- 
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

## Todos
- Express compatibility
- Tests
