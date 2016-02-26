/*
 * PJS JavaScript template
 * Copyright 2016 Sebastien Chopin
 * Inspired by EJS - Matthew Eernisse (mde@fleegix.org)
 */
'use strict';

/*
 * PJS internal functions.
 */

var fs = require('fs'),
    utils = require('./utils'),
    cache = utils.cache,
    VERSION_STRING = require('../package.json').version,
    trycatch = require('trycatch'),
    DEFAULT_DELIMITER = '%',
    DEFAULT_LOCALS_NAME = 'locals',
    REGEX_STRING = '(<%%|<%=|<%-|<%_|<%#|<%|%>|-%>|_%>)',
    OPTS = ['cache', 'filename', 'watchFiles', 'delimiter', 'debug', 'compileDebug', 'escape'],
    TRAILING_SEMCOL = /;\s*$/,
    BOM = /^\uFEFF/;

trycatch.configure({ colors: { node: false, node_modules: false, default: false } });

/**
 * Get the path to the included file from the parent file path and the
 * specified path.
 *
 * @param {String} name     specified path
 * @param {String} filename parent file path
 * @return {String}
 */

function resolveInclude(name, filename) {
  var path = require('path'),
      dirname = path.dirname,
      extname = path.extname,
      resolve = path.resolve,
      includePath = resolve(dirname(filename), name),
      ext = extname(name);
  if (!ext) {
    includePath += '.pjs';
  }
  return includePath;
}

/**
 * Get the template from a string or a file, either compiled on-the-fly or
 * read from cache (if enabled), and cache the template if needed.
 *
 * If `template` is not set, the file specified in `options.filename` will be
 * read.
 *
 * If `options.cache` is true, this function reads the file from
 * `options.filename` so it must be set prior to calling this function.
 *
 * @memberof module:pjs-internal
 * @param {Options} options   compilation options
 * @param {String} [template] template source
 * @return {(TemplateFunction|ClientFunction)}
 * @static
 */

function handleCache(options, template) {
  var fn,
      path = options.filename,
      hasTemplate = arguments.length > 1;

  if (options.cache) {
    if (!path) {
      throw new Error('cache option requires a filename');
    }
    fn = cache.get(path);
    if (fn) {
      return fn;
    }
    if (!hasTemplate) {
      template = fs.readFileSync(path).toString().replace(BOM, '');
    }
  }
  else if (!hasTemplate) {
    // istanbul ignore if: should not happen at all
    if (!path) {
      throw new Error('Internal EJS error: no file name or template provided');
    }
    template = fs.readFileSync(path).toString().replace(BOM, '');
  }
  fn = exports.compile(template, options);
  if (options.cache) {
    cache.set(path, fn, options.watchFiles);
  }
  return fn;
}

/**
 * Get the JavaScript source of an included file.
 *
 * @memberof module:pjs-internal
 * @param {String}  path    path for the specified file
 * @param {Options} options compilation options
 * @return {String}
 * @static
 */

function includeSource(path, options) {
  var opts = utils.shallowCopy({}, options),
      includePath,
      template;
  if (!opts.filename) {
    throw new Error('`include` requires the \'filename\' option.');
  }
  includePath = resolveInclude(path, opts.filename);
  try {
    template = fs.readFileSync(includePath).toString().replace(BOM, '');
  } catch(e) {
    throw new Error("Cannot include '" + path + "' in '" + opts.filename + "' template");
  }

  opts.filename = includePath;
  var templ = new Template(template, opts);
  templ.generateSource();
  return templ;
}

/**
 * Re-throw the given `err` in context to the `str` of pjs, `filename`, and
 * `lineno`.
 *
 * @implements RethrowCallback
 * @memberof module:pjs-internal
 * @param {Error}  err      Error object
 * @param {String} str      EJS source
 * @param {String} filename file name of the EJS file
 * @param {String} lineno   line number of the error
 * @static
 */

function rethrow(err, str, filename, lineno, callback){
  var lines = str.split('\n'),
      start = Math.max(lineno - 3, 0),
      end = Math.min(lines.length, lineno + 3);

  // Error context
  var context = lines.slice(start, end).map(function (line, i){
    var curr = i + start + 1;
    return (curr == lineno ? ' >> ' : '    ') + curr + '| ' + line;
  }).join('\n');

  // Alter exception message
  err.path = filename;
  err.message = (filename || 'pjs') + ':' + lineno + '\n' + context + '\n\n' + err.message + '\n';

  callback(err);
}

/**
 * Copy properties in data object that are recognized as options to an
 * options object.
 *
 * This is used for compatibility with earlier versions of EJS and Express.js.
 *
 * @memberof module:ejs-internal
 * @param {Object}  data data object
 * @param {Options} opts options object
 * @static
 */

function cpOptsInData(data, opts) {
  OPTS.forEach(function (p) {
    // istanbul ignore else
    if (typeof data[p] != 'undefined') {
      opts[p] = data[p];
    }
  });
}

/**
 * Compile the given `str` of pjs into a template function.
 *
 * @param {String}  template EJS template
 *
 * @param {Options} opts     compilation options
 *
 * @return {(TemplateFunction|ClientFunction)}
 * @public
 */

exports.compile = function (template, opts) {
  var templ;

  templ = new Template(template, opts);
  return templ.compile();
};

/**
 * Render the given PJS `template`
 *
 * If you would like to include options but not data, you need to explicitly
 * call this function with `data` being an empty object or `null`.
 *
 * @param {String}   template EJS template
 * @param {Object}  [data={}] template data
 * @param {Options} [opts={}] compilation and rendering options
 * @param {Render Callback} cb(err, html) callback
 * @public
 */

exports.render = function () {
  var args = Array.prototype.slice.call(arguments),
      template = args.shift(),
      cb = args.pop(),
      data = args.shift() || {},
      opts = args.pop() || {};

  // Don't pollute passed in opts obj with new vals
  opts = utils.shallowCopy({}, opts);

  try {
    handleCache(opts, template)(data, cb);
  }
  catch(err) {
    cb(err);
  }
};

/**
 * Render an PJS file at the given `path` and callback `cb(err, str)`.
 *
 * If you would like to include options but not data, you need to explicitly
 * call this function with `data` being an empty object or `null`.
 *
 * @param {String}             path     path to the EJS file
 * @param {Object}            [data={}] template data
 * @param {Options}           [opts={}] compilation and rendering options
 * @param {RenderFile Callback} cb(err, html) callback
 * @public
 */

exports.renderFile = function () {
  var args = Array.prototype.slice.call(arguments),
      path = args.shift(),
      cb = args.pop(),
      data = args.shift() || {},
      opts = args.pop() || {};

  // Don't pollute passed in opts obj with new vals
  opts = utils.shallowCopy({}, opts);

  // No options object -- if there are optiony names
  // in the data, copy them to options
  if (arguments.length == 3) {
    // Express 4
    if (data.settings && data.settings['view options']) {
      cpOptsInData(data.settings['view options'], opts);
    }
    // Express 3 and lower
    else {
      cpOptsInData(data, opts);
    }
  }
  opts.filename = path;

  try {
    handleCache(opts)(data, cb);
  }
  catch(err) {
    cb(err);
  }
};

/**
 * Clear intermediate JavaScript cache. Calls {@link Cache#reset}.
 * @public
 */

exports.clearCache = function () {
  cache.reset();
};

/**
 * Escape method
*/
exports.escape = utils.escapeXML;

function Template(text, opts) {
  opts = opts || {};
  var options = {};
  this.templateText = text;
  this.mode = null;
  this.truncate = false;
  this.currentLine = 1;
  this.source = '';
  this.endSource = '';
  options.escapeFunction = opts.escape || utils.escapeXML;
  options.compileDebug = opts.compileDebug !== false;
  options.debug = !!opts.debug;
  options.filename = opts.filename;
  options.delimiter = opts.delimiter || exports.delimiter || DEFAULT_DELIMITER;
  options.cache = opts.cache || false;
  options.watchFiles = opts.watchFiles || false;
  // options.localsName = opts.localsName || exports.localsName || DEFAULT_LOCALS_NAME;
  options.localsName = DEFAULT_LOCALS_NAME;

  this.opts = options;

  this.regex = this.createRegex();
}

Template.modes = {
  EVAL: 'eval',
  ESCAPED: 'escaped',
  RAW: 'raw',
  COMMENT: 'comment',
  LITERAL: 'literal'
};

Template.prototype = {
  createRegex: function () {
    var str = REGEX_STRING,
        delim = utils.escapeRegExpChars(this.opts.delimiter);
    str = str.replace(/%/g, delim);
    return new RegExp(str);
  },

  compile: function () {
    var src,
        fn,
        opts = this.opts,
        prepended = '',
        appended = '',
        escape = opts.escapeFunction;

    // Have to use two separate replace here as `^` and `$` operators don't
    // work well with `\r`.
    this.templateText = this.templateText.replace(/\r/g, '').replace(/^\s+|\s+$/gm, '');

    // Slurp spaces and tabs before <%_ and after _%>
    this.templateText = this.templateText.replace(/[ \t]*<%_/gm, '<%_').replace(/_%>[ \t]*/gm, '_%>');

    if (!this.source) {
      this.generateSource();
      prepended += 'var __output = [], __append = __output.push.bind(__output);' + '\n';
      prepended += 'with (' + opts.localsName + ' || {}) {' + '\n';
      appended += '}' + '\n';
      this.source = prepended + this.source + '\n'+ ' ; __callback(null, (__output.length > 1 ? __output.join("") : (__output[0] || "")));\n' + this.endSource + appended;
    }


    if (opts.compileDebug) {
      src = 'var __line = 1' + '\n' +
            '  , __lines = ' + JSON.stringify(this.templateText) + '\n' +
            '  , __filename = ' + (opts.filename ?
                JSON.stringify(opts.filename) : 'undefined') + ';' + '\n' +
            'trycatch(function () {' + '\n' +
            this.source +
            '}, function (e) {' + '\n' +
            ' rethrow(e, __lines, __filename, __line, __callback);' + '\n' +
            '});' + '\n';
    }
    else {
      src = 'trycatch(function () {' + '\n' +
        this.source +
        '}, function (e) {' + '\n' +
        ' __callback(e);' + '\n' +
        '});' + '\n';
    }

    if (opts.debug) {
      console.log(src);
    }

    try {
      fn = new Function(opts.localsName + ', __callback, escape, trycatch, rethrow', src);
    }
    catch(e) {
      // istanbul ignore else
      if (e instanceof SyntaxError) {
        if (opts.filename) {
          e.message += ' in ' + opts.filename;
        }
        e.message += ' while compiling pjs';
      }
      throw e;
    }

    // Return a callable function which will execute the function
    // created by the source-code, with the passed data as locals
    var returnedFn = function (data, callback) {
      if (typeof data === 'function' && !callback) {
        callback = data;
        data = {};
      }
      if (typeof callback !== 'function')
        throw new Error('A callback is required to get the html of the PJS template');
      process.nextTick(function () {
        fn.apply(null, [data || {}, callback, escape, trycatch, rethrow]);
      });
    };
    return returnedFn;
  },

  generateSource: function () {
    var self = this,
        matches = this.parseTemplateText(),
        d = this.opts.delimiter;

    if (matches && matches.length) {
      matches.forEach(function (line, index) {
        var opening,
            closing,
            include,
            includeOpts,
            includeSrc;
        // If this is an opening tag, check for closing tags
        if (line.indexOf('<' + d) === 0 &&     // If it is a tag
            line.indexOf('<' + d + d) !== 0) { // and is not escaped
          closing = matches[index + 2];
          if (!(closing == d + '>' || closing == '-' + d + '>' || closing == '_' + d + '>')) {
            throw new Error('Could not find matching close tag for "' + line + '".');
          }
        }
        if ((include = line.match(/^\s*include\s+(\S+)/))) {
          opening = matches[index - 1];
          // Must be in EVAL or RAW mode
          if (opening && (opening == '<' + d || opening == '<' + d + '-' || opening == '<' + d + '_')) {
            includeOpts = utils.shallowCopy({}, self.opts);
            includeSrc = includeSource(include[1], includeOpts);
            // includeSrc = '    ; (function(){' + '\n' + includeSrc + ' ; })()' + '\n';
            self.source += includeSrc.source;
            self.endSource = includeSrc.endSource + ';\n' + self.endSource;
            return;
          }
        }
        self.scanLine(line);
      });
    }
  },

  parseTemplateText: function () {
    var str = this.templateText,
        pat = this.regex,
        result = pat.exec(str),
        arr = [],
        firstPos,
        lastPos;

    while (result) {
      firstPos = result.index;
      lastPos = pat.lastIndex;

      if (firstPos !== 0) {
        arr.push(str.substring(0, firstPos));
        str = str.slice(firstPos);
      }

      arr.push(result[0]);
      str = str.slice(result[0].length);
      result = pat.exec(str);
    }

    if (str) {
      arr.push(str);
    }

    return arr;
  },

  scanLine: function (line) {
    var self = this,
        d = this.opts.delimiter,
        newLineCount = 0;

    function _addOutput() {
      if (self.truncate) {
        // Only replace single leading linebreak in the line after
        // -%> tag -- this is the single, trailing linebreak
        // after the tag that the truncation mode replaces
        // Handle Win / Unix / old Mac linebreaks -- do the \r\n
        // combo first in the regex-or
        line = line.replace(/^(?:\r\n|\r|\n)/, '');
        self.truncate = false;
      }
      // Gotta be more careful here.
      // .replace(/^(\s*)\n/, '$1') might be more appropriate here but as
      line = line.replace(/^\n/, '');
      if (!line) {
        return;
      }

      // Preserve literal slashes
      line = line.replace(/\\/g, '\\\\');

      // Convert linebreaks
      line = line.replace(/\n/g, '\\n');
      line = line.replace(/\r/g, '\\r');

      // Escape double-quotes
      // - this will be the delimiter during execution
      line = line.replace(/"/g, '\\"');
      self.source += ' ; __append("' + line + '")' + '\n';
    }

    newLineCount = (line.split('\n').length - 1);
    switch (line) {
      case '<' + d:
      case '<' + d + '_':
        this.mode = Template.modes.EVAL;
        break;
      case '<' + d + '=':
        this.mode = Template.modes.ESCAPED;
        break;
      case '<' + d + '-':
        this.mode = Template.modes.RAW;
        break;
      case '<' + d + '#':
        this.mode = Template.modes.COMMENT;
        break;
      case '<' + d + d:
        this.mode = Template.modes.LITERAL;
        this.source += '    ; __append("' + line.replace('<' + d + d, '<' + d) + '")' + '\n';
        break;
      case d + '>':
      case '-' + d + '>':
      case '_' + d + '>':
        if (this.mode == Template.modes.LITERAL) {
          _addOutput();
        }

        this.mode = null;
        this.truncate = line.indexOf('-') === 0 || line.indexOf('_') === 0;
        break;
      default:
        // In script mode, depends on type of tag
        if (this.mode) {
          // If '//' is found without a line break, add a line break.
          switch (this.mode) {
            case Template.modes.EVAL:
            case Template.modes.ESCAPED:
            case Template.modes.RAW:
              if (line.lastIndexOf('//') > line.lastIndexOf('\n')) {
                line += '\n';
              }
          }
          switch (this.mode) {
            // Just executing code
            case Template.modes.EVAL:
              var doneRegex = /(?:done\()(?:[^\)]*)(?:\))(?:;)?/gm; // VerEx().then('done(').anythingBut(')').then(')').maybe(';')
              line = line.replace(doneRegex, '__split__');
              var tab = line.split('__split__');
              // Dans la ligne, trouver la position de la regex (done()), le splitter et mettre la suite entre les deux
              this.source += ' ; ' + tab[0] + '\n';
              this.endSource = ' ; ' + tab.slice(1).join('\n') + ';\n' + this.endSource;
              break;
            // Exec, esc, and output
            case Template.modes.ESCAPED:
              this.source += ' ; __append(escape(' +
                line.replace(TRAILING_SEMCOL, '').trim() + '))' + '\n';
              break;
            // Exec and output
            case Template.modes.RAW:
              this.source += ' ; __append(' +
                line.replace(TRAILING_SEMCOL, '').trim() + ')' + '\n';
              break;
            case Template.modes.COMMENT:
              // Do nothing
              break;
            // Literal <%% mode, append as raw output
            case Template.modes.LITERAL:
              _addOutput();
              break;
          }
        }
        // In string mode, just add the output
        else {
          _addOutput();
        }
    }

    if (self.opts.compileDebug && newLineCount) {
      this.currentLine += newLineCount;
      this.source += '    ; __line = ' + this.currentLine + '\n';
    }
  }
};

/*
** Express.js support.
*/
exports.__express = exports.renderFile;

/* Version of PJS-Template */
exports.VERSION = VERSION_STRING;
