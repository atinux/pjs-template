'use strict';

var fs = require('fs');
var regExpChars = /[|\\{}()[\]^$+*?.]/g;

/**
 * Escape characters reserved in regular expressions.
 *
 * If `string` is `undefined` or `null`, the empty string is returned.
 *
 * @param {String} string Input string
 * @return {String} Escaped string
 * @static
 * @private
 */
exports.escapeRegExpChars = function (string) {
  // istanbul ignore if
  if (!string) {
    return '';
  }
  return String(string).replace(regExpChars, '\\$&');
};

var _ENCODE_HTML_RULES = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&#34;',
      "'": '&#39;'
    },
    _MATCH_HTML = /[&<>\'"]/g;

function encode_char(c) {
  return _ENCODE_HTML_RULES[c] || /* istanbul ignore next */ c;
}

/**
 * Escape characters reserved in XML.
 *
 * If `markup` is `undefined` or `null`, the empty string is returned.
 *
 * @implements {EscapeCallback}
 * @param {String} markup Input string
 * @return {String} Escaped string
 * @static
 * @private
 */

exports.escapeXML = function (markup) {
  return (typeof markup === "undefined" || markup === null ? '' : String(markup).replace(_MATCH_HTML, encode_char));
};

/**
 * Copy all properties from one object to another, in a shallow fashion.
 *
 * @param  {Object} to   Destination object
 * @param  {Object} from Source object
 * @return {Object}      Destination object
 * @static
 * @private
 */
exports.shallowCopy = function (to, from) {
  from = from || {};
  for (var p in from) {
    to[p] = from[p];
  }
  return to;
};


/**
 * Simple in-process cache implementation. Does not implement limits of any
 * sort.
 *
 * @implements Cache
 * @static
 * @private
 */
exports.cache = {
  _data: {},
  _watches: {},
  set: function (key, val, watchFiles) {
    this._data[key] = val;
    if (watchFiles)
      this.watch(key);
  },
  get: function (key) {
    return this._data[key];
  },
  del: function (key) {
    delete this._data[key];
    this.unwatch(key);
  },
  reset: function () {
    this._data = {};
  },
  watch: function (path) {
    // istanbul ignore if
    if (this._watches[path])
      return;
    var w = null;
    try {
      w = fs.watch(path);
    } catch (e) {
      return;
    }
    // console.log('Watch ['+path+'] file...');
    this._watches[path] = w;
    var that = this;
    w.on('change', function () {
      // console.log('File ['+path+'] changed!');
      that.del(path);
    });
    /* istanbul ignore next */
    w.on('error', function (err) {
      that.unwatch(path);
    });
  },
  unwatch: function (path) {
    // istanbul ignore else
    if (this._watches[path]) {
      this._watches[path].close();
      delete this._watches[path];
    }
  }
};
