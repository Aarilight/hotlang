import gulp = require("gulp");
import plumber = require("gulp-plumber");
import { createProject, Project } from "gulp-typescript";
import merge = require("merge2");
import mocha = require("gulp-mocha");
import del = require("del");

// const srcPlumber: typeof gulp.src = (globs, opt) => {
// 	return gulp.src(globs, opt)
// 		.pipe(plumber());
// }

let project: Project;
gulp.task("ts", () => {
	if (!project) project = createProject("./src/tsconfig.json");
	const result = project.src()
		.pipe(plumber())
		.pipe(project());

	return merge([
		result.js.pipe(gulp.dest("out")),
		result.dts.pipe(gulp.dest("out")),
	]);
});

gulp.task("mocha", (cb) => {
	gulp.src("out/tests/Main.js", { read: false })
		.pipe(mocha({ reporter: "min" }))
		.on("error", () => process.exitCode = 1)
		.on("finish", cb);
});

async function clean () { await del("out"); }

gulp.task("compile-test", gulp.series(clean, "ts", "mocha"));

gulp.task("watch", gulp.series("compile-test", () => {
	gulp.watch(["./src/**/*.ts"], gulp.series("compile-test"));
}));