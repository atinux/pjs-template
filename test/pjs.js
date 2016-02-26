/* jshint mocha: true */

/**
 * Module dependencies.
 */

var pjs = require('..'),
    fs = require('fs'),
    read = fs.readFileSync,
    assert = require('assert'),
    path = require('path'),
    async = require('async');

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
      assert.ok(out.foo);
      done();
    });
  });

  test('data object renders something raw with EOL', function (done) {
    pjs.render('\n<%- { bar: 10 } %>\n', function (err, out) {
      assert.equal(typeof out, 'object');
      assert.equal(out.bar, 10);
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
    var file = __dirname + '/tmp/render.pjs',
        options = { cache: true, filename: file };

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
    var file = __dirname + '/tmp/render2.pjs',
        options = { cache: true, watchFiles: true, filename: file },
        expected = '<p>Old</p>';

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
    var data =  { name: 'fonebone' },
        options = { delimiter: '$' };
    pjs.renderFile('test/fixtures/user.pjs', data, options, function(err, out) {
      assert.equal(out, '<h1>fonebone</h1>');
      done();
    });
  });

  test('support basic caching', function (done) {
    var expected = '<p>Old</p>',
        file = __dirname + '/tmp/renderFile.pjs',
        options = { cache: true };

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
    var file = __dirname + '/tmp/renderFile.pjs',
        options = { cache: true, watchFiles: true };

    pjs.clearCache();
    fs.writeFileSync(file, '<p>Old #2</p>');
    pjs.renderFile(file, {}, options, function (err, out) {
      assert.equal(out, '<p>Old #2</p>');
      // async write for updates
      fs.writeFile(file, '<p>New #2</p>', function (err) {
        assert.equal(null, err);
        pjs.renderFile(file, {}, options, function (err, out) {
          assert.equal(out, '<p>New #2</p>');
          // File already watched but without changed, same result
          pjs.renderFile(file, {}, options, function (err, out) {
            assert.equal(out, '<p>New #2</p>');
            done();
          });
        });
      });
    });
  });

});

suite('cache specific', function () {
  test('`clearCache` work properly', function (done) {
    var expected = '<p>Old</p>',
        file = __dirname + '/tmp/clearCache.pjs',
        options = {cache: true, filename: file};

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

suite('<%-', function () {
  test('not escape', function (done) {
    pjs.render('<%- name %>', { name: '<script>' }, function (err, out) {
      assert.equal(out, '<script>');
      done();
    });
  });

  test('terminate gracefully if no close tag is found', function () {
    try {
      pjs.compile('<h1>oops</h1><%- name ->');
    }
    catch (err) {
      assert.ok(err.message.indexOf('Could not find matching close tag for') > -1);
    }
  });
});

suite('%>', function () {
  test('produce newlines', function (done) {
    pjs.render(fixture('newlines.pjs'), {users: users}, function (err, out) {
      assert.equal(noWC(out), noWC(fixture('newlines.html')));
      done();
    });
  });
  test('works with `-%>` interspersed', function (done) {
    pjs.render(fixture('newlines.mixed.pjs'), {users: users}, function (err, out) {
      assert.equal(noWC(out), noWC(fixture('newlines.mixed.html')));
      done();
    });
  });
  test('consecutive tags work', function (done) {
    pjs.render(fixture('consecutive-tags.pjs'), function (err, out) {
      assert.equal(noWC(out), noWC(fixture('consecutive-tags.html')));
      done();
    });
  });
});

suite('-%>', function () {
  test('not produce newlines', function (done) {
    pjs.render(fixture('no.newlines.pjs'), {users: users}, function (err, out) {
      assert.equal(noWC(out), noWC(fixture('no.newlines.html')));
      done();
    });
  });
  test('stack traces work', function (done) {
    pjs.render(fixture('no.newlines.error.pjs'), function (err, out) {
      assert.notEqual(err.message.indexOf('>> 4| <%= qdata %>'), -1);
      done();
    });
  });

  test('works with unix style', function (done) {
    var content = "<ul><% -%>\n" +
        "<% users.forEach(function(user){ -%>\n" +
        "<li><%= user.name -%></li>\n" +
        "<% }) -%>\n" +
        "</ul><% -%>\n";

    var expectedResult = "<ul><li>geddy</li>\n<li>neil</li>\n<li>alex</li>\n</ul>";
    var fn;
    fn = pjs.compile(content);
    fn({users: users}, function (err, out) {
      assert.equal(out, expectedResult);
      done();
    });
  });

  test('works with windows style', function (done) {
    var content = "<ul><% -%>\r\n" +
        "<% users.forEach(function(user){ -%>\r\n" +
        "<li><%= user.name -%></li>\r\n" +
        "<% }) -%>\r\n" +
        "</ul><% -%>\r\n";

    var expectedResult = "<ul><li>geddy</li>\r\n<li>neil</li>\r\n<li>alex</li>\r\n</ul>";
    var fn;
    fn = pjs.compile(content);
    fn({users: users}, function (err, out) {
      assert.equal(noWC(out), noWC(expectedResult));
      done();
    });
  });
});

suite('<%%', function () {
  test('produce literals', function (done) {
    pjs.render('<%%- "foo" %>', function (err, out) {
      assert.equal(out, '<%- "foo" %>');
      done();
    });
  });
  test('work without an end tag', function (done) {
    pjs.render('<%%', function (err, out) {
      assert.equal(out, '<%');
      done();
    });
  });
  test('work without an end tag #2', function (done) {
    pjs.render(fixture('literal.pjs'), {}, {delimiter: ' '}, function (err, out) {
      assert.equal(noWC(out), noWC(fixture('literal.html')));
      done();
    });
  });
});

suite('<%_ and _%>', function () {
  test('slurps spaces and tabs', function (done) {
    pjs.render(fixture('space-and-tab-slurp.pjs'), {users: users}, function (err, out) {
      assert.equal(noWC(out), noWC(fixture('space-and-tab-slurp.html')));
      done();
    });
  });
});

suite('single quotes', function () {
  test('not mess up the constructed function', function (done) {
    pjs.render(fixture('single-quote.pjs'), function (err, out) {
      assert.equal(noWC(out), noWC(fixture('single-quote.html')));
      done();
    });
  });
});

suite('double quotes', function () {
  test('not mess up the constructed function', function (done) {
    pjs.render(fixture('double-quote.pjs'), function (err, out) {
      assert.equal(noWC(out), noWC(fixture('double-quote.html')));
      done();
    });
  });
});

suite('backslashes', function () {
  test('escape', function (done) {
    pjs.render(fixture('backslash.pjs'), function (err, out) {
      assert.equal(noWC(out), noWC(fixture('backslash.html')));
      done();
    });
  });
});

suite('messed up whitespace', function () {
  test('work', function (done) {
    pjs.render(fixture('messed.pjs'), {users: users}, function (err, out) {
      assert.equal(noWC(out), noWC(fixture('messed.html')));
      done();
    });
  });
});

suite('exceptions', function () {
  test('produce useful stack traces', function (done) {
    pjs.render(fixture('error.pjs'), {}, {filename: 'error.pjs'}, function (err, out) {
      assert.equal(err.path, 'error.pjs');
      assert.equal(err.message, fixture('error.out'));
      done();
    });
  });
  test('not include fancy stack info if compileDebug is false', function (done) {
    pjs.render(fixture('error.pjs'), {}, {
      filename: 'error.pjs',
      compileDebug: false
    }, function (err, out) {
      assert.ok(!err.path);
      assert.notEqual(err.stack.split('\n').slice(0, 8).join('\n'), fixture('error.out'));
      done();
    });
  });

  test('log JS source when debug is set', function (done) {
    var code = '';
    var unhook = hook_stdio(process.stdout, function (str) { code += str; });
    pjs.render(fixture('hello-world.pjs'), {}, {debug: true}, function (err, out) {
      unhook();
      assert.ok(code);
      done();
    });
  });
});

suite('preprocessor include', function () {
  test('work', function (done) {
    var file = 'test/fixtures/include_preprocessor.pjs';
    pjs.render(fixture('include_preprocessor.pjs'), {pets: users}, {filename: file, delimiter: '@'}, function (err, out) {
      assert.equal(noWC(out), noWC(fixture('include_preprocessor.html')));
      done();
    });
  });
  test('no false positives', function (done) {
    pjs.render('<% %> include foo <% %>', function (err, out) {
      assert.equal(out, ' include foo ');
      done();
    });
  });

  test('fails without `filename`', function (done) {
    pjs.render(fixture('include_preprocessor.pjs'), {pets: users}, {delimiter: '@'}, function (err, out) {
      assert.ok(err.message.indexOf('requires the \'filename\' option') > -1);
      done();
    });
  });

  test('strips BOM', function (done) {
    pjs.render('<% include fixtures/includes/bom.pjs %>', {}, {filename: path.join(__dirname, 'f.pjs')}, function (err, out) {
      assert.equal(out, '<p>This is a file with BOM.</p>\n');
      done();
    });
  });

  test('work when nested', function (done) {
    var file = 'test/fixtures/menu_preprocessor.pjs';
    pjs.render(fixture('menu_preprocessor.pjs'), {pets: users}, {filename: file}, function (err, out) {
      assert.equal(noWC(out), noWC(fixture('menu_preprocessor.html')));
      done();
    });
  });

  test('include arbitrary files as-is', function (done) {
    var file = 'test/fixtures/include_preprocessor.css.pjs';
    pjs.render(fixture('include_preprocessor.css.pjs'), {pets: users}, {filename: file}, function (err, out) {
      assert.equal(noWC(out), noWC(fixture('include_preprocessor.css.html')));
      done();
    });
  });

  test('pass compileDebug to include', function (done) {
    var file = 'test/fixtures/include_preprocessor.pjs',
        fn;
    fn = pjs.compile(fixture('include_preprocessor.pjs'), {
      filename: file,
      delimiter: '@',
      compileDebug: false
    });
    // Render without a required variable reference
    fn({foo: 'asdf'}, function (err) {
      assert.ok(err.message.indexOf('pets is not defined') > -1);
      assert.ok(!err.path);
      done();
    });
  });

  test('is static', function (done) {
    fs.writeFileSync(__dirname + '/tmp/include_preprocessor.pjs', '<p>Old</p>');
    var file = 'test/fixtures/include_preprocessor_cache.pjs',
        options = {filename: file},
        render = pjs.compile(fixture('include_preprocessor_cache.pjs'), options);
    render(function (err, out) {
      assert.equal(out, '<p>Old</p>');
      fs.writeFileSync(__dirname + '/tmp/include_preprocessor.pjs', '<p>New</p>');
      render(function (err, out) {
        assert.equal(out, '<p>Old</p>');
        done();
      });
    });
  });

  test('support caching', function (done) {
    fs.writeFileSync(__dirname + '/tmp/include_preprocessor.pjs', '<p>Old</p>');
    var file = 'test/fixtures/include_preprocessor_cache.pjs',
        options = {cache: true, filename: file},
        expected = fixture('include_preprocessor_cache.html');
    pjs.render(fixture('include_preprocessor_cache.pjs'), {}, options, function (err, out) {
      assert.equal(noWC(out), noWC(expected));
      fs.writeFileSync(__dirname + '/tmp/include_preprocessor.pjs', '<p>New</p>');
      pjs.render(fixture('include_preprocessor_cache.pjs'), {}, options, function (err, out) {
        assert.equal(noWC(out), noWC(expected));
        done();
      });
    });
  });

  test('Recursive include error handling', function (done) {
    pjs.renderFile('test/fixtures/include_preprocessor_recursive.pjs', function (err, out) {
      assert.ok(err);
      done();
    });
  });
});
suite('comments', function () {
  test('fully render with comments removed', function (done) {
    pjs.render(fixture('comments.pjs'), function (err, out) {
      assert.equal(noWC(out), noWC(fixture('comments.html')));
      done();
    });
  });
});
