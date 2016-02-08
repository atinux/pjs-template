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
    fn(function (err, html) {
      assert.equal(err, null);
      assert.equal(html, '<p>yay</p>');
      done();
    });
  });

  test('empty input works', function (done) {
    var fn = pjs.compile('');
    fn(function (err, html) {
      assert.equal(html, '');
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
      function (html, next) {
        assert.equal(html, '<p>geddy</p>');
        fn = pjs.compile('<p><:= name :></p>', {delimiter: ':'});
        fn({ name: 'geddy' }, next);
      },
      function (html, next) {
        assert.equal(html, '<p>geddy</p>');
        fn = pjs.compile('<p><$= name $></p>', {delimiter: '$'});
        fn({ name: 'geddy' }, next);
      },
      function (html, next) {
        assert.equal(html, '<p>geddy</p>');
        next();
      }
    ], done);
  });

  test('default to using pjs.delimiter', function (done) {
    var fn;
    pjs.delimiter = '&';
    fn = pjs.compile('<p><&= name &></p>');
    fn({name: 'geddy'}, function (err, html) {
      assert.equal(html, '<p>geddy</p>');
      fn = pjs.compile('<p><|= name |></p>', {delimiter: '|'});
      fn({name: 'geddy'}, function (err, html) {
        assert.equal(html, '<p>geddy</p>');
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

return;
// Try Travis

suite('pjs.render(str, data, opts)', function () {
  test('render the template', function () {
    assert.equal(pjs.render('<p>yay</p>'), '<p>yay</p>');
  });

  test('empty input works', function () {
    assert.equal(pjs.render(''), '');
  });

  test('undefined renders nothing escaped', function () {
    assert.equal(pjs.render('<%= undefined %>'), '');
  });

  test('undefined renders nothing raw', function () {
    assert.equal(pjs.render('<%- undefined %>'), '');
  });

  test('null renders nothing escaped', function () {
    assert.equal(pjs.render('<%= null %>'), '');
  });

  test('null renders nothing raw', function () {
    assert.equal(pjs.render('<%- null %>'), '');
  });

  test('zero-value data item renders something escaped', function () {
    assert.equal(pjs.render('<%= 0 %>'), '0');
  });

  test('zero-value data object renders something raw', function () {
    assert.equal(pjs.render('<%- 0 %>'), '0');
  });

  test('accept locals', function () {
    assert.equal(pjs.render('<p><%= name %></p>', {name: 'geddy'}),
        '<p>geddy</p>');
  });

  test('accept locals without using with() {}', function () {
    assert.equal(pjs.render('<p><%= locals.name %></p>', {name: 'geddy'},
                            {_with: false}),
        '<p>geddy</p>');
    assert.throws(function() {
      pjs.render('<p><%= name %></p>', {name: 'geddy'},
                 {_with: false});
    }, /name is not defined/);
  });

  test('accept custom name for locals', function () {
    pjs.localsName = 'it';
    assert.equal(pjs.render('<p><%= it.name %></p>', {name: 'geddy'},
                            {_with: false}),
        '<p>geddy</p>');
    assert.throws(function() {
      pjs.render('<p><%= name %></p>', {name: 'geddy'},
                 {_with: false});
    }, /name is not defined/);
    pjs.localsName = 'locals';
  });

  test('support caching', function () {
    var file = __dirname + '/tmp/render.pjs'
      , options = {cache: true, filename: file}
      , out = pjs.render('<p>Old</p>', {}, options)
      , expected = '<p>Old</p>';
    assert.equal(out, expected);
    // Assert no change, still in cache
    out = pjs.render('<p>New</p>', {}, options);
    assert.equal(out, expected);
  });

  test('support LRU caching', function () {
    var oldCache = pjs.cache
      , file = __dirname + '/tmp/render.pjs'
      , options = {cache: true, filename: file}
      , out
      , expected = '<p>Old</p>';

    // Switch to LRU
    pjs.cache = LRU();

    out = pjs.render('<p>Old</p>', {}, options);
    assert.equal(out, expected);
    // Assert no change, still in cache
    out = pjs.render('<p>New</p>', {}, options);
    assert.equal(out, expected);

    // Restore system cache
    pjs.cache = oldCache;
  });

  test('opts.context', function () {
    var ctxt = {foo: 'FOO'}
      , out = pjs.render('<%= this.foo %>', {}, {context: ctxt});
    assert.equal(out, ctxt.foo);
  });
});

suite('pjs.renderFile(path, [data], [options], fn)', function () {
  test('render a file', function(done) {
    pjs.renderFile('test/fixtures/para.pjs', function(err, html) {
      if (err) {
        return done(err);
      }
      assert.equal(html, '<p>hey</p>\n');
      done();
    });
  });

  test('accept locals', function(done) {
    var data =  {name: 'fonebone'}
      , options = {delimiter: '$'};
    pjs.renderFile('test/fixtures/user.pjs', data, options, function(err, html) {
      if (err) {
        return done(err);
      }
      assert.equal(html, '<h1>fonebone</h1>\n');
      done();
    });
  });

  test('accept locals without using with() {}', function(done) {
    var data =  {name: 'fonebone'}
      , options = {delimiter: '$', _with: false}
      , doneCount = 0;
    pjs.renderFile('test/fixtures/user-no-with.pjs', data, options,
                   function(err, html) {
      if (err) {
        if (doneCount === 2) {
          return;
        }
        doneCount = 2;
        return done(err);
      }
      assert.equal(html, '<h1>fonebone</h1>\n');
      doneCount++;
      if (doneCount === 2) {
        done();
      }
    });
    pjs.renderFile('test/fixtures/user.pjs', data, options, function(err) {
      if (!err) {
        if (doneCount === 2) {
          return;
        }
        doneCount = 2;
        return done(new Error('error not thrown'));
      }
      doneCount++;
      if (doneCount === 2) {
        done();
      }
    });
  });

  test('not catch err thrown by callback', function(done) {
    var data =  {name: 'fonebone'}
      , options = {delimiter: '$'}
      , counter = 0;

    var d = require('domain').create();
    d.on('error', function (err) {
      assert.equal(counter, 1);
      assert.equal(err.message, 'Exception in callback');
      done();
    });
    d.run(function () {
      // process.nextTick() needed to work around mochajs/mocha#513
      //
      // tl;dr: mocha doesn't support synchronous exception throwing in
      // domains. Have to make it async. Ticket closed because: "domains are
      // deprecated :D"
      process.nextTick(function () {
        pjs.renderFile('test/fixtures/user.pjs', data, options,
                       function(err) {
          counter++;
          if (err) {
            assert.notEqual(err.message, 'Exception in callback');
            return done(err);
          }
          throw new Error('Exception in callback');
        });
      });
    });
  });

  test('support caching', function (done) {
    var expected = '<p>Old</p>'
      , file = __dirname + '/tmp/renderFile.pjs'
      , options = {cache: true};
    fs.writeFileSync(file, '<p>Old</p>');

    pjs.renderFile(file, {}, options, function (err, out) {
      if (err) {
        done(err);
      }
      fs.writeFileSync(file, '<p>New</p>');
      assert.equal(out, expected);

      pjs.renderFile(file, {}, options, function (err, out) {
        if (err) {
          done(err);
        }
        // Assert no change, still in cache
        assert.equal(out, expected);
        done();
      });
    });
  });

  test('opts.context', function (done) {
    var ctxt = {foo: 'FOO'};
    pjs.renderFile('test/fixtures/with-context.pjs', {},
          {context: ctxt}, function(err, html) {
      if (err) {
        return done(err);
      }
      assert.equal(html, ctxt.foo + '\n');
      done();
    });

  });
});

suite('cache specific', function () {
  test('`clearCache` work properly', function () {
    var expected = '<p>Old</p>'
      , file = __dirname + '/tmp/clearCache.pjs'
      , options = {cache: true, filename: file}
      , out = pjs.render('<p>Old</p>', {}, options);
    assert.equal(out, expected);

    pjs.clearCache();

    expected = '<p>New</p>';
    out = pjs.render('<p>New</p>', {}, options);
    assert.equal(out, expected);
  });

  test('`clearCache` work properly, LRU', function () {
    var expected = '<p>Old</p>'
      , oldCache = pjs.cache
      , file = __dirname + '/tmp/clearCache.pjs'
      , options = {cache: true, filename: file}
      , out;

    pjs.cache = LRU();

    out = pjs.render('<p>Old</p>', {}, options);
    assert.equal(out, expected);
    pjs.clearCache();
    expected = '<p>New</p>';
    out = pjs.render('<p>New</p>', {}, options);
    assert.equal(out, expected);

    pjs.cache = oldCache;
  });

  test('LRU with cache-size 1', function () {
    var oldCache = pjs.cache
      , options
      , out
      , expected
      , file;

    pjs.cache = LRU(1);

    file = __dirname + '/tmp/render1.pjs';
    options = {cache: true, filename: file};
    out = pjs.render('<p>File1</p>', {}, options);
    expected = '<p>File1</p>';
    assert.equal(out, expected);

    // Same filename, different template, but output
    // should be the same because cache
    file = __dirname + '/tmp/render1.pjs';
    options = {cache: true, filename: file};
    out = pjs.render('<p>ChangedFile1</p>', {}, options);
    expected = '<p>File1</p>';
    assert.equal(out, expected);

    // Different filiename -- output should be different,
    // and previous cache-entry should be evicted
    file = __dirname + '/tmp/render2.pjs';
    options = {cache: true, filename: file};
    out = pjs.render('<p>File2</p>', {}, options);
    expected = '<p>File2</p>';
    assert.equal(out, expected);

    // Entry with first filename should now be out of cache,
    // results should be different
    file = __dirname + '/tmp/render1.pjs';
    options = {cache: true, filename: file};
    out = pjs.render('<p>ChangedFile1</p>', {}, options);
    expected = '<p>ChangedFile1</p>';
    assert.equal(out, expected);

    pjs.cache = oldCache;
  });
});

suite('<%', function () {
  test('without semicolons', function () {
    assert.equal(pjs.render(fixture('no.semicolons.pjs')),
        fixture('no.semicolons.html'));
  });
});

suite('<%=', function () {
  test('escape &amp;<script>', function () {
    assert.equal(pjs.render('<%= name %>', {name: '&nbsp;<script>'}),
        '&amp;nbsp;&lt;script&gt;');
  });

  test('should escape \'', function () {
    assert.equal(pjs.render('<%= name %>', {name: 'The Jones\'s'}),
      'The Jones&#39;s');
  });

  test('should escape &foo_bar;', function () {
    assert.equal(pjs.render('<%= name %>', {name: '&foo_bar;'}),
      '&amp;foo_bar;');
  });
});

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
