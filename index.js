module.exports = function (gulp) {
	var path = require('path'),
		ejs = require('ejs'),
		del = require('del'),
		options = require('minimist')(process.argv.slice(2));

		var cwd = process.cwd();

		var themeSettings = require(cwd + '/theme.json');

		var runSequence = require('run-sequence');
		var browserSync = require('browser-sync');
		var reload = browserSync.reload;
		var glob = require('glob');

		var lessSourcemap = require('gulp-less-sourcemap');

		var cmdTasks = options._;

		var themeDevTasks = ['less', 'browser-sync', 'copy', 'clean', 'serve', 'build'];

		function ThemeDevelopment(theme, branch) {
			this.setTheme(theme);
			this.setBranch(branch);
		}

		ThemeDevelopment.prototype.getTheme = function () {
			return this.theme;
		};

		ThemeDevelopment.prototype.setTheme = function (theme) {
			this.theme = theme;
		};

		ThemeDevelopment.prototype.getBranch = function () {
			return this.branch;
		};

		ThemeDevelopment.prototype.setBranch = function (branch) {
			this.branch = branch;
		};

		ThemeDevelopment.prototype.getPaths = function () {
			var themeBase = this.getBranch() + '/src/catalog/view/theme/'+ this.getTheme() + '/';

			return {
				build: this.getBranch() + '/build',
				less: themeBase +'less/{stylesheet,rtl}.less',
				stylesheet: themeBase + 'stylesheet',
				footerTpl: themeBase + 'template/common/footer.tpl'
			};
		};

		ThemeDevelopment.prototype.getWildcards = function () {
		  var themeBase = this.getBranch() + '/src/catalog/view/theme/'+ this.getTheme() + '/';

		  return wildcards = {
		    allFiles: this.getBranch() + '/src/**/*',
		    stylesheet: themeBase + 'stylesheet/*.css',
		    less: themeBase + 'less/*.less',
		    skinStylesheet: '!' + themeBase + 'stylesheet/' + this.getTheme() +'_skin*',
		    template: themeBase + 'template/*/*.tpl',
		    dataFolder: themeBase + 'data/*'
		  };
		};

		var currentThemeDevelopment = new ThemeDevelopment(themeSettings.theme, '');

		gulp.task('less', function () {
		  gulp.src(currentThemeDevelopment.getPaths().less)
		    .pipe(lessSourcemap({
		      sourceMapRootpath: '../less'
		    }))
		    .on('error', function (err) {
		    	console.log(err.message);
		    })
		    .pipe(gulp.dest(currentThemeDevelopment.getPaths().stylesheet));
		});

		gulp.task('browser-sync', function() {
		    browserSync.use(require("bs-snippet-injector"), {
		      file: currentThemeDevelopment.getPaths().footerTpl
		    });

		    browserSync({
		      files: currentThemeDevelopment.getWildcards().stylesheet
		    });
		});

		gulp.task('bs-reload', function () {
		    browserSync.reload();
		});

		gulp.task('copy', function() {
		  return gulp.src([currentThemeDevelopment.getWildcards().allFiles, currentThemeDevelopment.getWildcards().skinStylesheet])
		    .pipe(gulp.dest(currentThemeDevelopment.getPaths().build));
		});

		gulp.task('clean', function (cb) {
			del([currentThemeDevelopment.getPaths().build], cb);
		});

		gulp.task('serve', ['browser-sync'], function () {
			gulp.watch(currentThemeDevelopment.getWildcards().less, ['less']);
			gulp.watch(currentThemeDevelopment.getWildcards().template, ['bs-reload']);
			gulp.watch(currentThemeDevelopment.getWildcards().dataFolder, ['bs-reload']);
		});

		gulp.task('default', ['serve']);

		gulp.task('build', ['clean'], function (cb) {
			runSequence(['less', 'copy'], cb);
		});

		if (!cmdTasks[0] || themeDevTasks.indexOf(cmdTasks[0]) != -1) {
			/* Theme Development */
			currentThemeDevelopment.setBranch(options.b);

			if (!currentThemeDevelopment.getBranch()) {
				console.log('Can not find branch folder!\nPlease try to take a look at this example command: \'gulp serve -b v155x_v156x\'.');
				process.exit(1);
			}
		} else {
			var Q = require('q');

			/* Package */
			options.cwd = options.cwd || process.cwd();

			var packagePath = path.join(options.cwd, 'Theme_Package');

			gulp.task('pkg-clean', del.bind(null, [packagePath]));

			gulp.task('pkg', ['pkg-clean'], function () {
				var defer = Q.defer();

				function createPackage() {
					var resourcePath = process.env.KULER_THEME_BUILD_PATH + '/' + themeSettings['resourcePath'];

					var stream = gulp.src(resourcePath + '/**/*')
						.pipe(gulp.dest(packagePath));

					var itemPromises = [];

					stream.on('end', function () {
						var themePath = path.join(packagePath, 'Theme_v' + themeSettings['themeVersion']);

						themeSettings['opencarts'].forEach(function (opencart) {
							var opencartPath = path.join(themePath, opencart['name']),
								branch = opencart['theme_path'].replace('/build', '');

							var itemDefer = Q.defer();

							itemPromises.push(itemDefer);

							gulp.src(cwd + '/' + opencart['theme_path'] + '/**/*')
								.pipe(gulp.dest(opencartPath))
								.on('end', function () {
									itemDefer.resolve();
								});

							opencart['module_paths'].forEach(function (itemPath) {
								itemPath = path.normalize(process.env['KULER_MODULES_PATH_' + branch] + '/' + itemPath);

								var itemDefer = Q.defer();

								itemPromises.push(itemDefer);

								gulp.src(itemPath + '/**/*')
									.pipe(gulp.dest(opencartPath))
									.on('end', function () {
										itemDefer.resolve();
									});
							});
						});

						Q.all(itemPromises)
							.then(function () {
								defer.resolve();
							});
					});
				}

				// Build each branch
				function buildSequence(branches, index) {
					currentThemeDevelopment.setBranch(branches[index]);

					if (index < branches.length) {
						console.log('\n==============\nBuild branch ' + currentThemeDevelopment.getBranch() + '\n==============\n');

						runSequence('build', function () {
							buildSequence(branches, index + 1);
						});
					} else {
						createPackage();
					}
				}

				glob('v*', {sync: true}, function (err, files) {
				  buildSequence(files, 0);
				});

				return defer.promise;
			});
		}
};