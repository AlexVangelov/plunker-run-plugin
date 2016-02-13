var Boom = require('boom');
var MemoryFs = require("memory-fs");
var webpack = require('webpack');
var Bluebird = require('bluebird');

function getConfig(preview) {
  var wpconfig = preview.files['webpack.config.json'];
  if (typeof wpconfig === 'undefined') {
    wpconfig = preview.files['webpackfile.json'];
  }
  if (typeof wpconfig !== 'undefined') {
    try {
      var options = JSON.parse(wpconfig);
      new webpack.WebpackOptionsDefaulter().process(options);
      return options;
    } catch (err) {
      preview.log({
        source: 'Webpack configuration error',
        data: err.message
      });
      throw new Boom.badRequest('wpconfig.json error: ' + err.message, err);
    }
  }
}

module.exports = {
  matches: /\..+$/,
  provides: '.js',
  providesIndirect: function(pathname, preview) {
    var wpconfig = getConfig(preview);
    var names = [], ids = [], files = [];

    if (typeof wpconfig === 'undefined') {
      return false;
    }
    
    switch(typeof wpconfig.entry) {
      case "string":
        names.push("main");
        ids.push(0);
        break;
      case "object":
        var index = 0;
        for (var entry in wpconfig.entry) {
          names.push(entry);
          ids.push(index++);
        }
        break;
      default:
        console.log("Can't read entry");
    }
    
    if (wpconfig.output) {
      var path = wpconfig.output.path ? wpconfig.output.path + "/" : ""
      var filename = wpconfig.output.filename;
      if (/\[name\]/.test(wpconfig.output.filename)) {
        for (var i in names) {
          files.push(path + filename.replace(/\[name\]/, names[i]));
        }
      }
      if (/\[id\]/.test(wpconfig.output.filename)) {
        for (var i in ids) {
          files.push(path + filename.replace(/\[id\]/, ids[i]));
        }
      }
    }
    return (files.indexOf("/"+pathname) !== -1);
  },
  transform: function (context) {
    var wpconfig = getConfig(context.preview);
    var fs = new MemoryFs();
    var compiler = webpack({});    
    
    for (var file in context.preview.files) {
      fs.writeFileSync("/" + file, context.preview.files[file]);
    }

    compiler.inputFileSystem = fs;
    compiler.resolvers.normal.fileSystem = fs;
    compiler.resolvers.context.fileSystem = fs;
    compiler.outputFileSystem = fs;
    
    compiler.options = new webpack.WebpackOptionsApply().process(wpconfig, compiler);
    
    return new Bluebird(function(resolve, reject) {
      compiler.run(function(err, stats) {
        if (err) {
          console.log(err);
          return reject(err.message);
        }
        //console.log(stats.toJson());
        resolve(fs.readFileSync("/"+context.requestPath).toString());
      });
    });
  },
};