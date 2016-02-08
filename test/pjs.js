/* jshint mocha: true */

/**
 * Module dependencies.
 */

var pjs = require('..')
  , fs = require('fs')
  , read = fs.readFileSync
  , assert = require('assert')
  , path = require('path')
  , async = require('async');

try {
  fs.mkdirSync(__dirname + '/tmp');
} catch (ex) {
  if (ex.code !== 'EEXIST') {
    throw ex;
  }
}

// From https://gist.github.com/pguillory/729616
function hook_stdio(stream, callback) {
  var old_write = stream.write;

  stream.write = (function() {
    return function(string, encoding, fd) {
      callback(string, encoding, fd);
    };
  })(stream.write);

  return function() {
    stream.write = old_write;
  };
}

/**
 * Load fixture `name`.
 */

function fixture(name) {
  return read('test/fixtures/' + name, 'utf8');
}


// Remove White Chars
function noWC(str) {
  return String(str).replace(/\r/g, '').replace(/^\s+|\s+$/mg, '').replace(/\n/g, '');
}
/**
 * User fixtures.
 */

var users = [];
users.push({name: 'geddy'});
users.push({name: 'neil'});
users.push({name: 'alex'});

suite('pjs.compile(str, options)', function () {
  test('compile to a function', function (done) {
    var fn = pjs.compile('<p>yay</p>');
    assert.equal(typeof fn, 'function');
    fn(function (err, out) {
      assert.equal(err, null);
      assert.equal(out, '<p>yay</p>');
      done();
    });
  });

  test('empty input works', function (done) {
    var fn = pjs.compile('');
    fn(function (err, out) {
      assert.equal(out, '');
      done();
    });
  });

  test('throw if there are syntax errors', function () {
    try {
      pjs.compile(fixture('fail.pjs'));
    }
    catch (err) {
      assert.ok(err.message.indexOf('compiling pjs') > -1);

      try {
        pjs.compile(fixture('fail.pjs'), { filename: 'fail.pjs' });
      }
      catch (err) {
        assert.ok(err.message.indexOf('fail.pjs') > -1);
        return;
      }
    }
    throw new Error('no error reported when there should be');
  });

  test('allow customizing delimiter local var', function (done) {
    var fn;
    async.waterfall([
      function (next) {
        fn = pjs.compile('<p><?= name ?></p>', {delimiter: '?'});
        fn({ name: 'geddy' }, next);
      },
      function (out, next) {
        assert.equal(out, '<p>geddy</p>');
        fn = pjs.compile('<p><:= name :></p>', {delimiter: ':'});
        fn({ name: 'geddy' }, next);
      },
      function (out, next) {
        assert.equal(out, '<p>geddy</p>');
        fn = pjs.compile('<p><$= name $></p>', {delimiter: '$'});
        fn({ name: 'geddy' }, next);
      },
      function (out, next) {
        assert.equal(out, '<p>geddy</p>');
        next();
      }
    ], done);
  });

  test('default to using pjs.delimiter', function (done) {
    var fn;
    pjs.delimiter = '&';
    fn = pjs.compile('<p><&= name &></p>');
    fn({name: 'geddy'}, function (err, out) {
      assert.equal(out, '<p>geddy</p>');
      fn = pjs.compile('<p><|= name |></p>', {delimiter: '|'});
      fn({name: 'geddy'}, function (err, out) {
        assert.equal(out, '<p>geddy</p>');
        delete pjs.delimiter;
        done();
      });
    });
  });

  test('throw callback required when ommited', function () {
    var fn = pjs.compile('<p><%= name %></p>');
    try {
      fn({ name: 'foo' });
    } catch (err) {
      assert.notEqual(err.toString().indexOf('callback'), -1);
    }
  });
});

suite('pjs.render(str, data, opts)', function () {
  test('render the template', function (done) {
    pjs.render('<p>yay</p>', function (err, out) {
      assert.equal(err, null);
      assert.equal(out, '<p>yay</p>');
      done();
    });
  });

  test('empty input works', function (done) {
    pjs.render('', function (err, out) {
      assert.equal(out, '');
      done();
    });
  });

  test('undefined renders nothing escaped', function (done) {
    pjs.render('<%= undefined %>', function (err, out) {
      assert.equal(out, '');
      done();
    });
  });

  test('undefined renders nothing raw', function (done) {
    pjs.render('<%- undefined %>', function (err, out) {
      assert.equal(out, '');
      done();
    });
  });

  test('null renders nothing escaped', function (done) {
    pjs.render('<%= null %>', function (err, out) {
      assert.equal(out, '');
      done();
    });
  });

  test('null renders nothing raw', function (done) {
    pjs.render('<%- null %>', function (err, out) {
      assert.equal(out, '');
      done();
    });
  });

  test('zero-value data item renders something escaped', function (done) {
    pjs.render('<%= 0 %>', function (err, out) {
      assert.equal(out, '0');
      done();
    });
  });

  test('zero-value data object renders something raw', function (done) {
    pjs.render('<%- 0 %>', function (err, out) {
      assert.equal(out, 0);
      done();
    });
  });

  test('data object renders something raw', function (done) {
    pjs.render('<%- { foo: true } %>', function (err, out) {
      assert.equal(typeof out, 'object');
      assert.ok(out.foo)
      done();
    });
  });

  test('data object renders something raw with EOL', function (done) {
    pjs.render('\n<%- { bar: 10 } %>\n', function (err, out) {
      assert.equal(typeof out, 'object');
      assert.equal(out.bar, 10)
      done();
    });
  });

  test('accept locals', function (done) {
    pjs.render('<p><%= name %></p>', { name: 'geddy' }, function (err, out) {
      assert.equal(out, '<p>geddy</p>');
      done();
    });
  });

  test('support caching', function (done) {
    var file = __dirname + '/tmp/render.pjs'
      , options = { cache: true, filename: file };

    async.waterfall([
      function (next) {
        pjs.render('<p>Old</p>', {}, options, next);
      },
      function (out, next) {
        assert.equal(out, '<p>Old</p>');
        pjs.render('<p>New</p>', {}, options, next);
      },
      function (out, next) {
        // Assert no change, still in cache
        assert.equal(out, '<p>Old</p>');
        // Clear cache
        pjs.clearCache();
        // Render again
        pjs.render('<p>New</p>', {}, options, next);
      },
      function (out, next) {
        // Assert no change, still in cache
        assert.equal(out, '<p>New</p>');
        pjs.clearCache();
        next();
      }
    ], done);
  });

  test('no error if caching and watchFiles but no real file', function (done) {
    var file = __dirname + '/tmp/render2.pjs'
      , options = { cache: true, watchFiles: true, filename: file }
      , expected = '<p>Old</p>';

    pjs.render('<p>Old</p>', {}, options, function (err, out) {
      assert.equal(err, null);
      assert.equal(out, expected);
      // Assert no change, still in cache
      pjs.render('<p>New</p>', {}, options, function (err, out) {
        assert.equal(err, null);
        assert.equal(out, expected);
        done();
      });
    });
  });

});

suite('pjs.renderFile(path, [data], [options], fn)', function () {
  test('render a file', function(done) {
    pjs.renderFile('test/fixtures/para.pjs', function(err, out) {
      assert.equal(out, '<p>hey</p>');
      done();
    });
  });

  test('accept locals', function(done) {
    var data =  { name: 'fonebone' }
      , options = { delimiter: '$' };
    pjs.renderFile('test/fixtures/user.pjs', data, options, function(err, out) {
      assert.equal(out, '<h1>fonebone</h1>');
      done();
    });
  });

  test('support basic caching', function (done) {
    var expected = '<p>Old</p>'
      , file = __dirname + '/tmp/renderFile.pjs'
      , options = { cache: true };

    fs.writeFileSync(file, '<p>Old</p>');
    pjs.renderFile(file, {}, options, function (err, out) {
      fs.writeFileSync(file, '<p>New</p>');
      assert.equal(out, expected);
      pjs.renderFile(file, {}, options, function (err, out) {
        // Assert no change, still in cache
        assert.equal(out, expected);
        done();
      });
    });
  });

  test('support smart caching (watchFiles: true)', function (done) {
    var file = __dirname + '/tmp/renderFile.pjs'
      , options = { cache: true, watchFiles: true };

    pjs.clearCache();
    fs.writeFileSync(file, '<p>Old #2</p>');
    pjs.renderFile(file, {}, options, function (err, out) {
      assert.equal(out, '<p>Old #2</p>');
      // async write for updates
      fs.writeFile(file, '<p>New #2</p>', function (err) {
        assert.equal(null, err);
        pjs.renderFile(file, {}, options, function (err, out) {
          assert.equal(out, '<p>New #2</p>');
          done();
        });
      });
    });
  });

});

suite('cache specific', function () {
  test('`clearCache` work properly', function (done) {
    var expected = '<p>Old</p>'
      , file = __dirname + '/tmp/clearCache.pjs'
      , options = {cache: true, filename: file};

    pjs.render('<p>Old</p>', {}, options, function (err, out) {
      assert.equal(out, expected);
      pjs.clearCache();
      expected = '<p>New</p>';
      pjs.render('<p>New</p>', {}, options, function (err, out) {
        assert.equal(out, expected);
        done();
      });
    });
  });
});

suite('<%', function () {
  test('without semicolons', function (done) {
    pjs.render(fixture('no.semicolons.pjs'), function (err, out) {
      assert.equal(noWC(out), noWC(fixture('no.semicolons.html')));
      done();
    });
  });
});

suite('<%=', function () {
  test('escape &amp;<script>', function (done) {
    pjs.render('<%= name %>', {name: '&nbsp;<script>'}, function (err, out) {
      assert.equal(out, '&amp;nbsp;&lt;script&gt;');
      done();
    });
  });
  test('should escape \'', function (done) {
    pjs.render('<%= name %>', {name: 'The Jones\'s'}, function (err, out) {
      assert.equal(out, 'The Jones&#39;s');
      done();
    });
  });
  test('should escape &foo_bar;', function (done) {
    pjs.render('<%= name %>', {name: '&foo_bar;'}, function (err, out) {
      assert.equal(out, '&amp;foo_bar;');
      done();
    });
  });
});
return;

suite('<%-', function () {
  test('not escape', function () {
    assert.equal(pjs.render('<%- name %>', {name: '<script>'}),
        '<script>');
  });

  test('terminate gracefully if no close tag is found', function () {
    try {
      pjs.compile('<h1>oops</h1><%- name ->');
      throw new Error('Expected parse failure');
    }
    catch (err) {
      assert.ok(err.message.indexOf('Could not find matching close tag for') > -1);
    }
  });
});

suite('%>', function () {
  test('produce newlines', function () {
    assert.equal(pjs.render(fixture('newlines.pjs'), {users: users}),
      fixture('newlines.html'));
  });
  test('works with `-%>` interspersed', function () {
    assert.equal(pjs.render(fixture('newlines.mixed.pjs'), {users: users}),
      fixture('newlines.mixed.html'));
  });
  test('consecutive tags work', function () {
    assert.equal(pjs.render(fixture('consecutive-tags.pjs')),
      fixture('consecutive-tags.html'));
  });
});

suite('-%>', function () {
  test('not produce newlines', function () {
    assert.equal(pjs.render(fixture('no.newlines.pjs'), {users: users}),
      fixture('no.newlines.html'));
  });
  test('stack traces work', function () {
    try {
      pjs.render(fixture('no.newlines.error.pjs'));
    }
    catch (e) {
      if (e.message.indexOf('>> 4| <%= qdata %>') > -1) {
        return;
      }
      throw e;
    }
    throw new Error('Expected ReferenceError');
  });

  test('works with unix style', function () {
    var content = "<ul><% -%>\n"
    + "<% users.forEach(function(user){ -%>\n"
    + "<li><%= user.name -%></li>\n"
    + "<% }) -%>\n"
    + "</ul><% -%>\n";

    var expectedResult = "<ul><li>geddy</li>\n<li>neil</li>\n<li>alex</li>\n</ul>";
    var fn;
    fn = pjs.compile(content);
    assert.equal(fn({users: users}),
      expectedResult);
  });

  test('works with windows style', function () {
    var content = "<ul><% -%>\r\n"
    + "<% users.forEach(function(user){ -%>\r\n"
    + "<li><%= user.name -%></li>\r\n"
    + "<% }) -%>\r\n"
    + "</ul><% -%>\r\n";

    var expectedResult = "<ul><li>geddy</li>\r\n<li>neil</li>\r\n<li>alex</li>\r\n</ul>";
    var fn;
    fn = pjs.compile(content);
    assert.equal(fn({users: users}),
      expectedResult);
  });
});

suite('<%%', function () {
  test('produce literals', function () {
    assert.equal(pjs.render('<%%- "foo" %>'),
      '<%- "foo" %>');
  });
  test('work without an end tag', function () {
    assert.equal(pjs.render('<%%'), '<%');
    assert.equal(pjs.render(fixture('literal.pjs'), {}, {delimiter: ' '}),
      fixture('literal.html'));
  });
});

suite('<%_ and _%>', function () {
  test('slurps spaces and tabs', function () {
    assert.equal(pjs.render(fixture('space-and-tab-slurp.pjs'), {users: users}),
      fixture('space-and-tab-slurp.html'));
  });
});

suite('single quotes', function () {
  test('not mess up the constructed function', function () {
    assert.equal(pjs.render(fixture('single-quote.pjs')),
      fixture('single-quote.html'));
  });
});

suite('double quotes', function () {
  test('not mess up the constructed function', function () {
    assert.equal(pjs.render(fixture('double-quote.pjs')),
      fixture('double-quote.html'));
  });
});

suite('backslashes', function () {
  test('escape', function () {
    assert.equal(pjs.render(fixture('backslash.pjs')),
      fixture('backslash.html'));
  });
});

suite('messed up whitespace', function () {
  test('work', function () {
    assert.equal(pjs.render(fixture('messed.pjs'), {users: users}),
      fixture('messed.html'));
  });
});

suite('exceptions', function () {
  test('produce useful stack traces', function () {
    try {
      pjs.render(fixture('error.pjs'), {}, {filename: 'error.pjs'});
    }
    catch (err) {
      assert.equal(err.path, 'error.pjs');
      assert.equal(err.stack.split('\n').slice(0, 8).join('\n'), fixture('error.out'));
      return;
    }
    throw new Error('no error reported when there should be');
  });

  test('not include fancy stack info if compileDebug is false', function () {
    try {
      pjs.render(fixture('error.pjs'), {}, {
        filename: 'error.pjs',
        compileDebug: false
      });
    }
    catch (err) {
      assert.ok(!err.path);
      assert.notEqual(err.stack.split('\n').slice(0, 8).join('\n'), fixture('error.out'));
      return;
    }
    throw new Error('no error reported when there should be');
  });

  var unhook = null;
  test('log JS source when debug is set', function (done) {
    var out = ''
      , needToExit = false;
    unhook = hook_stdio(process.stdout, function (str) {
      out += str;
      if (needToExit) {
        return;
      }
      if (out.indexOf('__output')) {
        needToExit = true;
        unhook();
        unhook = null;
        return done();
      }
    });
    pjs.render(fixture('hello-world.pjs'), {}, {debug: true});
  });
  teardown(function() {
    if (!unhook) {
      return;
    }
    unhook();
    unhook = null;
  });
});

suite('rmWhitespace', function () {
  test('works', function () {
    assert.equal(pjs.render(fixture('rmWhitespace.pjs'), {}, {rmWhitespace: true}),
        fixture('rmWhitespace.html'));
  });
});

suite('include()', function () {
  test('include pjs', function () {
    var file = 'test/fixtures/include-simple.pjs';
    assert.equal(pjs.render(fixture('include-simple.pjs'), {}, {filename: file}),
        fixture('include-simple.html'));
  });

  test('include pjs fails without `filename`', function () {
    try {
      pjs.render(fixture('include-simple.pjs'));
    }
    catch (err) {
      assert.ok(err.message.indexOf('requires the \'filename\' option') > -1);
      return;
    }
    throw new Error('expected inclusion error');
  });

  test('strips BOM', function () {
    assert.equal(
      pjs.render('<%- include("fixtures/includes/bom.pjs") %>',
        {}, {filename: path.join(__dirname, 'f.pjs')}),
      '<p>This is a file with BOM.</p>\n');
  });

  test('include pjs with locals', function () {
    var file = 'test/fixtures/include.pjs';
    assert.equal(pjs.render(fixture('include.pjs'), {pets: users}, {filename: file, delimiter: '@'}),
        fixture('include.html'));
  });

  test('include pjs with absolute path and locals', function () {
    var file = 'test/fixtures/include-abspath.pjs';
    assert.equal(pjs.render(fixture('include-abspath.pjs'),
      {dir: path.join(__dirname, 'fixtures'), pets: users, path: path},
      {filename: file, delimiter: '@'}),
        fixture('include.html'));
  });

  test('work when nested', function () {
    var file = 'test/fixtures/menu.pjs';
    assert.equal(pjs.render(fixture('menu.pjs'), {pets: users}, {filename: file}),
        fixture('menu.html'));
  });

  test('work with a variable path', function () {
    var file = 'test/fixtures/menu_var.pjs',
        includePath = 'includes/menu-item';
    assert.equal(pjs.render(fixture('menu.pjs'), {pets: users, varPath:  includePath}, {filename: file}),
      fixture('menu.html'));
  });

  test('include arbitrary files as-is', function () {
    var file = 'test/fixtures/include.css.pjs';
    assert.equal(pjs.render(fixture('include.css.pjs'), {pets: users}, {filename: file}),
        fixture('include.css.html'));
  });

  test('pass compileDebug to include', function () {
    var file = 'test/fixtures/include.pjs'
      , fn;
    fn = pjs.compile(fixture('include.pjs'), {
      filename: file
    , delimiter: '@'
    , compileDebug: false
    });
    try {
      // Render without a required variable reference
      fn({foo: 'asdf'});
    }
    catch(e) {
      assert.equal(e.message, 'pets is not defined');
      assert.ok(!e.path);
      return;
    }
    throw new Error('no error reported when there should be');
  });

  test('is dynamic', function () {
    fs.writeFileSync(__dirname + '/tmp/include.pjs', '<p>Old</p>');
    var file = 'test/fixtures/include_cache.pjs'
      , options = {filename: file}
      , out = pjs.compile(fixture('include_cache.pjs'), options);
    assert.equal(out(), '<p>Old</p>\n');

    fs.writeFileSync(__dirname + '/tmp/include.pjs', '<p>New</p>');
    assert.equal(out(), '<p>New</p>\n');
  });

  test('support caching', function () {
    fs.writeFileSync(__dirname + '/tmp/include.pjs', '<p>Old</p>');
    var file = 'test/fixtures/include_cache.pjs'
      , options = {cache: true, filename: file}
      , out = pjs.render(fixture('include_cache.pjs'), {}, options)
      , expected = fixture('include_cache.html');
    assert.equal(out, expected);
    out = pjs.render(fixture('include_cache.pjs'), {}, options);
    // No change, still in cache
    assert.equal(out, expected);
    fs.writeFileSync(__dirname + '/tmp/include.pjs', '<p>New</p>');
    out = pjs.render(fixture('include_cache.pjs'), {}, options);
    assert.equal(out, expected);
  });

});

suite('preprocessor include', function () {
  test('work', function () {
    var file = 'test/fixtures/include_preprocessor.pjs';
    assert.equal(pjs.render(fixture('include_preprocessor.pjs'), {pets: users}, {filename: file, delimiter: '@'}),
        fixture('include_preprocessor.html'));
  });

  test('no false positives', function () {
    assert.equal(pjs.render('<% %> include foo <% %>'), ' include foo ');
  });

  test('fails without `filename`', function () {
    try {
      pjs.render(fixture('include_preprocessor.pjs'), {pets: users}, {delimiter: '@'});
    }
    catch (err) {
      assert.ok(err.message.indexOf('requires the \'filename\' option') > -1);
      return;
    }
    throw new Error('expected inclusion error');
  });

  test('strips BOM', function () {
    assert.equal(
      pjs.render('<% include fixtures/includes/bom.pjs %>',
        {}, {filename: path.join(__dirname, 'f.pjs')}),
      '<p>This is a file with BOM.</p>\n');
  });

  test('work when nested', function () {
    var file = 'test/fixtures/menu_preprocessor.pjs';
    assert.equal(pjs.render(fixture('menu_preprocessor.pjs'), {pets: users}, {filename: file}),
        fixture('menu_preprocessor.html'));
  });

  test('tracks dependency correctly', function () {
    var file = 'test/fixtures/menu_preprocessor.pjs'
      , fn = pjs.compile(fixture('menu_preprocessor.pjs'), {filename: file});
    assert(fn.dependencies.length);
  });

  test('include arbitrary files as-is', function () {
    var file = 'test/fixtures/include_preprocessor.css.pjs';
    assert.equal(pjs.render(fixture('include_preprocessor.css.pjs'), {pets: users}, {filename: file}),
        fixture('include_preprocessor.css.html'));
  });

  test('pass compileDebug to include', function () {
    var file = 'test/fixtures/include_preprocessor.pjs'
      , fn;
    fn = pjs.compile(fixture('include_preprocessor.pjs'), {
      filename: file
    , delimiter: '@'
    , compileDebug: false
    });
    try {
      // Render without a required variable reference
      fn({foo: 'asdf'});
    }
    catch(e) {
      assert.equal(e.message, 'pets is not defined');
      assert.ok(!e.path);
      return;
    }
    throw new Error('no error reported when there should be');
  });

  test('is static', function () {
    fs.writeFileSync(__dirname + '/tmp/include_preprocessor.pjs', '<p>Old</p>');
    var file = 'test/fixtures/include_preprocessor_cache.pjs'
      , options = {filename: file}
      , out = pjs.compile(fixture('include_preprocessor_cache.pjs'), options);
    assert.equal(out(), '<p>Old</p>\n');

    fs.writeFileSync(__dirname + '/tmp/include_preprocessor.pjs', '<p>New</p>');
    assert.equal(out(), '<p>Old</p>\n');
  });

  test('support caching', function () {
    fs.writeFileSync(__dirname + '/tmp/include_preprocessor.pjs', '<p>Old</p>');
    var file = 'test/fixtures/include_preprocessor_cache.pjs'
      , options = {cache: true, filename: file}
      , out = pjs.render(fixture('include_preprocessor_cache.pjs'), {}, options)
      , expected = fixture('include_preprocessor_cache.html');
    assert.equal(out, expected);
    fs.writeFileSync(__dirname + '/tmp/include_preprocessor.pjs', '<p>New</p>');
    out = pjs.render(fixture('include_preprocessor_cache.pjs'), {}, options);
    assert.equal(out, expected);
  });

});

suite('comments', function () {
  test('fully render with comments removed', function () {
    assert.equal(pjs.render(fixture('comments.pjs')),
        fixture('comments.html'));
  });
});

suite('require', function () {

  // Only works with inline/preprocessor includes
  test('allow pjs templates to be required as node modules', function () {
      var file = 'test/fixtures/include_preprocessor.pjs'
        , template = require(__dirname + '/fixtures/menu_preprocessor.pjs');
      if (!process.env.running_under_istanbul) {
        assert.equal(template({filename: file, pets: users}),
          fixture('menu_preprocessor.html'));
      }
  });
});

suite('examples', function () {
  function noop () {}
  fs.readdirSync('examples').forEach(function (f) {
    if (!/\.js$/.test(f)) {
      return;
    }
    suite(f, function () {
      test('doesn\'t throw any errors', function () {
        var stderr = hook_stdio(process.stderr, noop)
          , stdout = hook_stdio(process.stdout, noop);
        try {
          require('../examples/' + f);
        }
        catch (ex) {
          stdout();
          stderr();
          throw ex;
        }
        stdout();
        stderr();
      });
    });
  });
});
