/// <reference types="mocha" />

import chai = require("chai");
import chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
const expect = chai.expect;

import fs = require("mz/fs");
import mkdirp = require("mkdirp-promise");
import del = require("del");

import Hot = require("../Hot");

async function expectHot (hot: string, html: string) {
	expect(await Hot.parse(hot)).eq(html);
}
async function expectHotError (hot: string, message: string) {
	await expect(Hot.parse(hot)).rejectedWith(Error, message);
}


describe("Hot", () => {
	describe("parse", () => {
		it("simple element", async () => {
			await expectHot("div", "<div></div>");
		});
		it("element with id", async () => {
			await expectHot("div#foo", `<div id="foo"></div>`);
		});
		it("element with class", async () => {
			await expectHot("div.bar", `<div class="bar"></div>`);
			await expectHot("div.boo.bar", `<div class="boo bar"></div>`);
		});
		it("element with attributes", async () => {
			await expectHot("div[attr]", "<div attr></div>");
			await expectHot(`div[foo: "bar"]`, `<div foo="bar"></div>`);
		});
		it("element with child", async () => {
			await expectHot("div: span", "<div>\n\t<span></span>\n</div>");
		});
		it("string", async () => {
			await expectHot(`"Hello, world!"`, "Hello, world!");
		});
		it("element with string", async () => {
			await expectHot(`span: "Hello, world!"`, "<span>\n\tHello, world!\n</span>");
		});
		it("element with only-children", async () => {
			await expectHot(`span:= "Hello, world!"`, "<span>Hello, world!</span>");
		});
		it("element with multiple only-children", async () => {
			await expectHot(`
				span:=
					"Hello,"
					span: "world!"
					span: "wow"
			`, "<span>Hello,<span>\n\tworld!\n</span><span>\n\twow\n</span></span>");
		});
		it("element with child and string", async () => {
			await expectHot(`
				span:
					"Hello,"
					span: "world!"
			`, "<span>\n\tHello,\n\t<span>\n\t\tworld!\n\t</span>\n</span>");
		});
		it("block string", async () => {
			await expectHot(`
				"""
					This is a
					block string.
			`, "This is a<br>block string.");
			await expectHot(`
				"""
					This is a
					block string.
				"""
					div: "hay"`,
				"This is a<br>block string.\n<div>\n\thay\n</div>",
			);
		});
		it("comment", async () => {
			await expectHot("# comment", "");
			await expectHot("div # comment", "<div></div>");
		});
		it("comment, kept", async () => {
			await expectHot("## comment", "<!-- comment -->");
			await expectHot("div ## comment\ndiv", "<div></div>\n<!-- comment -->\n<div></div>");
		});
		it("comment block", async () => {
			await expectHot(`
				###
					This is a
					block comment.
			`, "");
			await expectHot(`
				###
					This is a
					block comment.
				###
					div: "hay"`,
				"<div>\n\thay\n</div>",
			);
			await expectHot(`
				### This is a
					block comment. ### div: "hay"`,
				"<div>\n\thay\n</div>",
			);
		});
		it("comment block, kept", async () => {
			await expectHot(`
				####
					This is a
					block comment.
			`, "<!--\nThis is a\nblock comment.\n-->");
			await expectHot(`
				####
					This is a
					block comment.
				###
					div: "hay"`,
				"<!--\nThis is a\nblock comment.\n-->\n<div>\n\thay\n</div>",
			);
			await expectHot(`
				#### This is a
					block comment. ### div: "hay"`,
				"<!--\nThis is a\nblock comment.\n-->\n<div>\n\thay\n</div>",
			);
		});
		it("importing", async () => {
			// relative
			await expectHot(`!import[style; src: "./test"]`, `<link rel="stylesheet" href="./test.css"/>`);
			await expectHot(`!import[script; src: "./test"]`, `<script src="./test.js"></script>`);
			await expectHotError(`!import[src: "./test"]`, `Can't import a hot file when parsing a hot string.`);

			// absolute
			await expectHot(`!import[style; src: "/test"]`, `<link rel="stylesheet" href="/test.css"/>`);
			await expectHot(`!import[script; src: "/test"]`, `<script src="/test.js"></script>`);

			// web
			await expectHot(`!import[style; src: "http://blahblooblee.com/coolcss"]`, `<link rel="stylesheet" href="http://blahblooblee.com/coolcss"/>`);
			await expectHot(`!import[script; src: "https://blahblooblee.com/cooljs"]`, `<script src="https://blahblooblee.com/cooljs"></script>`);
		});
	});
	describe("compile", () => {
		const files = {
			"hello.hot": `span: "Hello, world!"`,
			"import.hot": `!import[src: "./hello"]`,
			"secret/secret.hot": `
				secret
				!import[src: "../hello"]
			`,
			"secret/multi.hot": `
				!import[src: "../*"]
			`,
			"secret/resources.hot": `
				!import[style; src: "/test"]
				!import[script; src: "/test"]
			`,
			"content/import-content.hot": `
				!import[src: "./accept-content"]: div: "Hello, world!"
				!import[src: "./accept-content"]: div: 
					"Hello, world!"
					"Hello, world!"
			`,
			"content/accept-content.hot": `span: !content`,
			"content/helloworld.hot": `!import[src: "./hello"]: "world"`,
			"content/hello.hot": `span:= "Hello, " !content "!"`
		};

		beforeEach(async () => {
			const promises: Promise<any>[] = [];
			await mkdirp("tests/secret/super-secret");
			await mkdirp("tests/content");
			for (const file in files)
				promises.push(fs.writeFile(`tests/${file}`, files[file as keyof typeof files]));
			await Promise.all(promises);
		});

		afterEach(async () => {
			const promises: Promise<any>[] = [];
			for (const file in files)
				promises.push(fs.unlink(`tests/${file}`));
			await Promise.all(promises);
			await del("tests");
		});

		it("should compile a file", async () => {
			await Hot.compile("tests/hello.hot");
			const result = await fs.readFile("tests/hello.html", "utf8");
			await fs.unlink("tests/hello.html");
			expect(result).eq("<span>\n\tHello, world!\n</span>");
		});

		it("should import other files", async () => {
			await Hot.compile("tests/import.hot");
			const result = await fs.readFile("tests/import.html", "utf8");
			await fs.unlink("tests/import.html");
			expect(result).eq("<span>\n\tHello, world!\n</span>");
		});

		it("should import other files and pass any content in to them", async () => {
			await Hot.compile("tests/content/import-content.hot");
			let result = await fs.readFile("tests/content/import-content.html", "utf8");
			await fs.unlink("tests/content/import-content.html");
			expect(result).eq("<span>\n\t<div>\n\t\tHello, world!\n\t</div>\n</span>\n<span>\n\t<div>\n\t\tHello, world!\n\t\tHello, world!\n\t</div>\n</span>");

			await Hot.compile("tests/content/helloworld.hot");
			result = await fs.readFile("tests/content/helloworld.html", "utf8");
			await fs.unlink("tests/content/helloworld.html");
			expect(result).eq("<span>Hello, world!</span>");
		});

		it("should compile a folder of files", async () => {
			await Hot.compile("tests");

			const results = await Promise.all([
				fs.readFile("tests/hello.html", "utf8"),
				fs.readFile("tests/import.html", "utf8"),
			]);

			await expect(fs.unlink("tests/secret/secret.html")).rejected;

			for (const result of results) {
				expect(result).eq("<span>\n\tHello, world!\n</span>");
			}

			await Promise.all([
				fs.unlink("tests/hello.html"),
				fs.unlink("tests/import.html"),
			]);
		});

		it("should import all files matching a glob", async () => {
			await Hot.compile("tests/secret/multi.hot");
			const result = await fs.readFile("tests/secret/multi.html", "utf8");
			await fs.unlink("tests/secret/multi.html");
			expect(result).eq("<span>\n\tHello, world!\n</span>\n<span>\n\tHello, world!\n</span>");
		});

		describe("using the hotconfig.json", () => {
			async function config (config: Hot.Config) {
				await fs.writeFile("tests/hotconfig.json", JSON.stringify(config));
			}

			async function rmconfig () {
				await fs.unlink("tests/hotconfig.json");
			}

			it("should compile a single file", async () => {
				await config({
					file: "secret/secret.hot",
				});

				await Hot.compile("tests");

				expect(await fs.readFile("tests/secret/secret.html", "utf8")).eq("<secret></secret>\n<span>\n\tHello, world!\n</span>");
				await fs.unlink("tests/secret/secret.html");

				await rmconfig();
			});

			it("should compile matching files", async () => {
				await config({
					files: "**/*.hot",
				});

				await Hot.compile("tests");

				expect(await fs.readFile("tests/secret/secret.html", "utf8")).eq("<secret></secret>\n<span>\n\tHello, world!\n</span>");
				await fs.unlink("tests/secret/secret.html");
				expect(await fs.readFile("tests/hello.html", "utf8")).eq("<span>\n\tHello, world!\n</span>");
				await fs.unlink("tests/hello.html");
				expect(await fs.readFile("tests/import.html", "utf8")).eq("<span>\n\tHello, world!\n</span>");
				await fs.unlink("tests/import.html");

				await rmconfig();
			});

			it("should compile a file to the specified out file", async () => {
				await config({
					file: "secret/secret.hot",
					out: "bizbaz.html",
				});

				await Hot.compile("tests");

				expect(await fs.readFile("tests/bizbaz.html", "utf8")).eq("<secret></secret>\n<span>\n\tHello, world!\n</span>");
				await fs.unlink("tests/bizbaz.html");

				await rmconfig();
			});

			it("should compile files to the specified out directory", async () => {
				await config({
					files: "**/*.hot",
					outDir: "foobar",
				});

				await Hot.compile("tests");

				expect(await fs.readFile("tests/foobar/secret/secret.html", "utf8")).eq("<secret></secret>\n<span>\n\tHello, world!\n</span>");
				await fs.unlink("tests/foobar/secret/secret.html");
				expect(await fs.readFile("tests/foobar/hello.html", "utf8")).eq("<span>\n\tHello, world!\n</span>");
				await fs.unlink("tests/foobar/hello.html");
				expect(await fs.readFile("tests/foobar/import.html", "utf8")).eq("<span>\n\tHello, world!\n</span>");
				await fs.unlink("tests/foobar/import.html");

				await rmconfig();
			});

			it("should compile all imported files", async () => {
				await config({
					file: "secret/secret.hot",
					compileAll: true,
				});

				await Hot.compile("tests");

				expect(await fs.readFile("tests/secret/secret.html", "utf8")).eq("<secret></secret>\n<span>\n\tHello, world!\n</span>");
				await fs.unlink("tests/secret/secret.html");
				expect(await fs.readFile("tests/hello.html", "utf8")).eq("<span>\n\tHello, world!\n</span>");
				await fs.unlink("tests/hello.html");

				await expect(fs.unlink("tests/import.html")).rejectedWith(/^ENOENT: /);

				await rmconfig();
			});

			it("should compile all imported files to a different directory", async () => {
				await config({
					file: "secret/secret.hot",
					compileAll: true,
					out: "secret/secret.html",
					outDir: "secret/super-secret",
				});

				await Hot.compile("tests");

				expect(await fs.readFile("tests/secret/secret.html", "utf8")).eq("<secret></secret>\n<span>\n\tHello, world!\n</span>");
				await fs.unlink("tests/secret/secret.html");
				expect(await fs.readFile("tests/secret/super-secret/hello.html", "utf8")).eq("<span>\n\tHello, world!\n</span>");
				await fs.unlink("tests/secret/super-secret/hello.html");

				await rmconfig();
			});

			it("should not mangle absolute paths", async () => {
				await config({
					file: "secret/resources.hot",
				});

				await Hot.compile("tests");

				expect(await fs.readFile("tests/secret/resources.html", "utf8"))
					.eq("<link rel=\"stylesheet\" href=\"/test.css\"/>\n<script src=\"/test.js\"></script>");
			})
		});

	});

	// todo command line tests
});