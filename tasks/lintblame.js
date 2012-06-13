/*
 * grunt-lintblame
 * 
 *
 * Copyright (c) 2012 Jamund Ferguson
 * Licensed under the MIT license.
 */

var gitblame = require('gitblame');
var async = require('async');
 
module.exports = function(grunt) {

  // External libs.
  var jshint = require('jshint').JSHINT;
  
  // ==========================================================================
  // TASKS
  // ==========================================================================

  grunt.registerMultiTask('lintblame', 'Validate files with JSHint and git blame.', function() {
    // Get flags and globals, allowing target-specific options and globals to
    // override the default options and globals.
    var options, globals, tmp;
    var done = this.async();

    tmp = grunt.config(['jshint', this.target, 'options']);
    if (typeof tmp === 'object') {
      grunt.verbose.writeln('Using "' + this.target + '" JSHint options.');
      options = tmp;
    } else {
      grunt.verbose.writeln('Using master JSHint options.');
      options = grunt.config('jshint.options');
    }
    grunt.verbose.writeflags(options, 'Options');

    tmp = grunt.config(['jshint', this.target, 'globals']);
    if (typeof tmp === 'object') {
      grunt.verbose.writeln('Using "' + this.target + '" JSHint globals.');
      globals = tmp;
    } else {
      grunt.verbose.writeln('Using master JSHint globals.');
      globals = grunt.config('jshint.globals');
    }
    grunt.verbose.writeflags(globals, 'Globals');

    // Lint specified files.
    var files = grunt.file.expandFiles(this.file.src);
    var len = files.length;
    var errors = 0;
    async.forEachSeries(files, function(filepath, next) {
      lintblame(grunt.file.read(filepath), options, globals, filepath, function(err) {
        if (err) errors++;
        next();
      });
    }, function(err) {
        grunt.log.writeln("Found " + errors + " files with errors");      
        done();
    });

  });

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  // No idea why JSHint treats tabs as options.indent # characters wide, but it
  // does. See issue: https://github.com/jshint/jshint/issues/430
  function getTabStr(options) {
    // Do something that's going to error.
    jshint('\tx', options || {});
    // If an error occurred, figure out what character JSHint reported and
    // subtract one.
    var character = jshint.errors && jshint.errors[0] && jshint.errors[0].character - 1;
    // If character is actually a number, use it. Otherwise use 1.
    var tabsize = isNaN(character) ? 1 : character;
    // If tabsize > 1, return something that should be safe to use as a
    // placeholder. \uFFFF repeated 2+ times.
    return tabsize > 1 && grunt.utils.repeat(tabsize, '\uFFFF');
  }

  var tabregex = /\t/g;

  // Lint source code with JSHint.
  function lintblame(src, options, globals, extraMsg, cb) {
    // JSHint sometimes modifies objects you pass in, so clone them.
    options = grunt.utils._.clone(options);
    globals = grunt.utils._.clone(globals);
    // Enable/disable debugging if option explicitly set.
    if (grunt.option('debug') !== undefined) {
      options.devel = options.debug = grunt.option('debug');
      // Tweak a few things.
      if (grunt.option('debug')) {
        options.maxerr = Infinity;
      }
    }
    var msg = 'Linting' + (extraMsg ? ' ' + extraMsg : '') + '...';
    grunt.verbose.write(msg);
    // Tab size as reported by JSHint.
    var tabstr = getTabStr(options);
    var placeholderregex = new RegExp(tabstr, 'g');
    // Lint.
    var result = jshint(src, options || {}, globals || {});
    // Attempt to work around JSHint erroneously reporting bugs.
    // if (!result) {
    //   // Filter out errors that shouldn't be reported.
    //   jshint.errors = jshint.errors.filter(function(o) {
    //     return o && o.something === 'something';
    //   });
    //   // If no errors are left, JSHint actually succeeded.
    //   result = jshint.errors.length === 0;
    // }
    if (result) {
      // Success!
      grunt.verbose.ok();
      cb(null);
    } else {
      gitblame(extraMsg, function(err, blameLines) {
        
        // Something went wrong.
        grunt.verbose.or.write(msg);
        grunt.log.error();
        // Iterate over all errors.
        jshint.errors.forEach(function(e) {
          // Sometimes there's no error object.
          if (!e) { return; }
          var pos;
          var evidence = e.evidence;
          var character = e.character;
          if (evidence) {
  
            // Manually increment errorcount since we're not using grunt.log.error().
            grunt.fail.errorcount++;
            // Descriptive code error.
            pos = '['.red + ('L' + e.line).yellow + ':'.red + ('C' + character).yellow + ']'.red;
            grunt.log.writeln(pos + ' ' + e.reason.yellow);
            // If necessary, eplace each tab char with something that can be
            // swapped out later.
            if (tabstr) {
              evidence = evidence.replace(tabregex, tabstr);
            }
            if (character > evidence.length) {
              // End of line.
              evidence = evidence + ' '.inverse.red;
            } else {
              // Middle of line.
              evidence = evidence.slice(0, character - 1) + evidence[character - 1].inverse.red +
                evidence.slice(character);
            }
            // Replace tab placeholder (or tabs) but with a 2-space soft tab.
            evidence = evidence.replace(tabstr ? placeholderregex : tabregex, '  ');            
   
            // find out the guilty party
            // grunt.log.writeln(evidence); 
            grunt.log.writeln(blameLines[e.line]); 
  
          } else {
            // Generic "Whoops, too many errors" error.
            grunt.log.error(e.reason);
          }
        });

        grunt.log.writeln();
        setTimeout(function() { cb(new Error("You had some problems")); }, 50);
      });
    }
  }

};