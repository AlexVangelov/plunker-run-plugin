var Boom = require('boom');
var Typescript = require('typescript');
var _ = require('lodash');
var fs = require('fs');

var defaultCompileOptions = _.extend(Typescript.getDefaultCompilerOptions(), {
  allowNonTsExtensions: true,
  isolatedModules: true,
  module: Typescript.ModuleKind.UMD,
  noLib: true,
  noResolve: false,
  target: Typescript.ScriptTarget.ES3,
});

function getConfig(preview) {
  var tsconfig = preview.files['tsconfig.json'];
  if (typeof tsconfig !== 'undefined') {
    try {
      return JSON.parse(tsconfig);
    } catch (err) {
      preview.log({
        source: 'Typescript configuration error',
        data: err.message
      });
      throw new Boom.badRequest('tsconfig.json error: ' + err.message, err);
    }
  }
}

module.exports = {
  matches: /\.ts$/,
  provides: ".js",
  providesIndirect: function(pathname, preview) {
    var tsconfig = getConfig(preview);

    if (typeof tsconfig !== 'undefined') {
      return (tsconfig.compilerOptions && pathname === tsconfig.compilerOptions.outFile);
    }
  },
  transform: function (context) {
    var options = _.defaults({}, context.compileOptions, defaultCompileOptions);
    
    var tsconfig = getConfig(context.preview);
    
    if (typeof tsconfig !== 'undefined') {
      _.extend(options, tsconfig.compilerOptions);
    }

    context.preview.files[context.requestPath] = '';

    var compilerHost = {
      getSourceFile: function (filename) {
        var fileContent = context.preview.files[filename];
        if (!fileContent && Typescript.getDefaultLibFilePath(options) === filename) {
          fileContent = fs.readFileSync(filename, 'utf8');
        }
        return Typescript.createSourceFile(filename, fileContent, options.target);
      },
      writeFile: function (filename, text) {
        context.preview.files[context.requestPath] += text;
      },
      getDefaultLibFileName: function(options) {
        return Typescript.getDefaultLibFilePath(options);
      },
      useCaseSensitiveFileNames: _.constant(false),
      getCanonicalFileName: _.identity,
      getCurrentDirectory: _.constant(''),
      getNewLine: _.constant('\n'),
    };

    var sourcePaths = context.sourceContent ? [context.sourcePath] : tsconfig.files;

    var program = Typescript.createProgram(sourcePaths, options, compilerHost);
    var result = program.emit();
    var diagnostics = Typescript.getPreEmitDiagnostics(program)
      .concat(result.diagnostics);
      
    if (diagnostics.length) {
      var lastError = 'Compilation error';
      
      diagnostics.forEach(function (diagnostic) {
        lastError = Typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        
        var msg = {
          source: 'typescript',
          data: lastError,
        };
        
        if (diagnostic.file) {
          var coords = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
          
          msg.filename = diagnostic.file.fileName;
          msg.line = coords.line;
          msg.position = coords.character;
        }

        context.preview.log(msg);
      });
    }

    if (!context.preview.files[context.requestPath]) {
      throw new Boom.badRequest('Compilation failed: ' + lastError, lastError);
    }

    return context.preview.files[context.requestPath];
  }
};
