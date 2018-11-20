#!/usr/bin/env node

let debug = false;

import commondir = require("commondir");
import glob = require("glob-promise");
import mkdirp = require("mkdirp-promise");
import fs = require("mz/fs");
import path = require("path");

function tabbify (str: string, amount = 1) {
	return str.replace(/^|(\n)/g, "$1\t");
}
function replaceExt (filePath: string, ext: string) {
	return path.join(path.dirname(filePath), path.basename(filePath, path.extname(filePath)) + "." + ext);
}
function makeAttributeString (attributes: { [key: string]: any }, ...blacklist: string[]) {
	let result = "";
	for (const attributeName in attributes) {
		if (blacklist.indexOf(attributeName) > -1) continue;
		const attributeVal = attributes[attributeName];
		result += " " + attributeName + (attributeVal === null ? "" : `="${attributeVal}"`);
	}
	return result.slice(1);
}

const Regex = {
	Whitespace: /^\s+/,
	WhitespaceUntilNewLine: /^[ \t]*\r?\n/,
	Word: /^[a-zA-Z][a-zA-Z0-9-]*/,
	StringBlock: /^"""/,
	CommentBlock: /^###/,

	getNameOf (reg: RegExp) {
		for (const r in Regex) {
			if (Regex[r as keyof typeof Regex] === reg) {
				return r;
			}
		}
		return undefined;
	},
};
const Char = {
	String: "\"",
	Comment: "#",
	Additional: ",",
	Class: ".",
	Id: "#",
	AttributeStart: "[",
	AttributeEnd: "]",
	AttributeVal: ":",
	AttributeNoValAdditional: ";",
	Escape: "\\",
	EscapeNewline: "n",
	EscapeTab: "t",
	ElementChildren: ":",
	ElementChild: "=",
	Call: "!",
};

interface LastMatchSave {
	regex: RegExp;
	length: number;
}
interface ImportArgs {
	src: string;
	language?: string;
	lang?: string;
	script?: "";
	style?: "";
	template?: "";
}

class Hot {

	private line: number;
	private indent: number;
	private input: string;
	private index: number;
	private lastMatch: LastMatchSave;
	private file: string;
	private outFile: string;
	private config: Hot.Config;
	private options: Hot.HotParseOptions = {};

	constructor(config?: Hot.Config) {
		this.config = config;
	}

	public async setFile (file: string) {
		this.file = file;
		this.input = await fs.readFile(file, "utf8");
		return true;
	}

	public async parse (hotText?: string, options: Hot.HotParseOptions = {}) {
		if (hotText) this.input = hotText;
		this.line = 0;
		this.index = 0;
		this.indent = 0;
		this.options = options;
		return (await this.parseChildren(-1)).replace(/\r/g, "");
	}
	public async compile (out?: string, writeFile = true, options?: Hot.HotParseOptions) {
		if (!out) {
			if (!this.file && writeFile) throw new Error("Cannot compile automatically, no filename to compile to.");
			out = replaceExt(this.file, "html");
		}
		this.outFile = out;
		const result = await this.parse(undefined, options);
		if (writeFile) {
			await mkdirp(path.dirname(out));
			await fs.writeFile(out, result);
		}
		return result;
	}

	private get char () {
		return this.input[this.index];
	}
	private matches (reg: RegExp) {
		const match = this.input.slice(this.index).match(reg);
		if (!match) return 0;
		const result = match[0].length;
		this.lastMatch = {
			regex: reg,
			length: result,
		};
		return result;
	}
	private extract (reg: RegExp) {
		if (this.lastMatch === undefined || this.lastMatch.regex !== reg) this.matches(reg);
		if (this.lastMatch === undefined) this.throw(`Expected ${Regex.getNameOf(reg)}`);
		const result = this.input.slice(this.index, this.index + this.lastMatch.length);
		this.index += this.lastMatch.length;
		this.lastMatch = undefined;
		return result;
	}
	private consume (reg: RegExp) {
		const match = this.input.slice(this.index).match(reg);
		if (match) {
			this.index += match[0].length;
			this.lastMatch = undefined;
			if (reg === Regex.Whitespace) {
				const lines = match[0].split("\n");
				this.line += lines.length - 1;
				if (lines.length > 1) {
					const currentLine = lines.pop();
					this.indent = currentLine.split("\t").length - 1;
				}

			}
			return true;
		}
		return false;
	}
	private consumeChar (char: string) {
		if (this.char == char) {
			this.index++;
			this.lastMatch = undefined;
			return true;
		}
		return false;
	}

	private throw (message = "Error", index = this.index) {
		this.printLocation();
		const split = this.input.slice(0, index).split("\n");
		const lineNumber = split.length;
		const column = split[lineNumber - 1].length;
		throw new Error(`${message} at [${lineNumber}:${column}]`);
	}

	private printLocation (index = this.index) {
		const split = this.input.slice(0, index).split("\n");
		const beginningOfLine = split.pop();
		const line = beginningOfLine + this.input.slice(index).split("\n")[0];
		console.log(line);
		console.log(" ".repeat(beginningOfLine.match(/^\t*/)[0].length * 3 + beginningOfLine.length) + "^");
		console.log("\n");
	}

	private async parseChildren (untilIndent: number, join = "\n") {
		let result = "";
		const line = this.line;
		this.consume(Regex.Whitespace);
		while ((this.indent > untilIndent || line == this.line) && this.index < this.input.length) {
			const expr = await this.parseExpression();
			if (expr.length > 0) result += join + expr;
			this.consume(Regex.Whitespace);
		}
		return result.slice(join.length);
	}
	private async parseExpression () {
		this.consume(Regex.Whitespace);
		switch (this.char) {
			case Char.String: {
				return this.parseString();
			}
			case Char.Comment: {
				return this.parseComment();
			}
			case Char.Call: {
				this.index++;
				if (this.matches(Regex.Word)) {
					return await this.parseCall();
				}
			}
			default: {
				if (this.matches(Regex.Word)) {
					return await this.parseElement();
				}
			}
		}
		this.throw(`Invalid character: ${this.char}`);
	}
	private async parseElement () {
		const elementName = this.extract(Regex.Word);
		let result = `<${elementName}`;
		if (this.consumeChar(Char.Id)) {
			const idName = this.extract(Regex.Word);
			result += ` id="${idName}"`;
		}
		let classes = "";
		while (this.consumeChar(Char.Class)) {
			classes += " " + this.extract(Regex.Word);
		}
		if (classes.length > 0) {
			result += ` class="${classes.slice(1)}"`;
		}
		await this.parseAttributes((attribute, value) => {
			result += value === undefined ? ` ${attribute}` : ` ${attribute}="${value}"`;
		});
		result += ">";
		if (this.consumeChar(Char.ElementChildren)) {
			if (this.consumeChar(Char.ElementChild)) {
				result += await this.parseChildren(this.indent, "");
			} else {
				result += "\n" + tabbify(await this.parseChildren(this.indent)) + "\n";
			}
		}
		result += `</${elementName}>`;
		return result;
	}
	private async parseAttributes (callback?: (attribute: string, value?: any) => any) {
		if (this.consumeChar(Char.AttributeStart)) {
			const result: { [key: string]: any } = {};
			this.consume(Regex.Whitespace);
			while (!this.consumeChar(Char.AttributeEnd)) {
				const attribute = this.extract(Regex.Word);
				if (this.consumeChar(Char.AttributeVal)) {
					this.consume(Regex.Whitespace);
					const value = await this.parseExpression();
					result[attribute] = callback ? callback(attribute, value) : value;
					this.consumeChar(Char.Additional);
				} else {
					result[attribute] = callback ? callback(attribute) : "";
					this.consumeChar(Char.AttributeNoValAdditional);
				}
				this.consume(Regex.Whitespace);
			}
			return result;
		}
	}
	private parseString () {
		if (this.consume(Regex.StringBlock))
			return this.parseStringBlock(this.indent);

		this.consumeChar(Char.String);
		let result = "";
		for (; this.char != Char.String; this.index++) {
			if (this.char == Char.Escape) {
				this.index++;
				switch (this.char) {
					case Char.EscapeNewline: {
						result += "\n";
						continue;
					}
					case Char.EscapeTab: {
						result += "\t";
						continue;
					}
				}
			}
			result += this.char;
		}
		this.index++;
		return result;
	}
	private parseStringBlock (untilIndent: number) {
		const result: string[] = [];
		this.consume(Regex.WhitespaceUntilNewLine);
		while (true) {
			let line = "";
			this.indent = 0;
			for (; this.char == "\t"; this.index++) {
				this.indent++;
				if (this.indent > untilIndent + 1) line += "\t";
			}
			if (this.char == Char.String && this.consume(Regex.StringBlock)) break;
			if (this.char != "\n" && this.indent <= untilIndent) break;
			for (; this.char && this.char != "\n"; line += this.char, this.index++);
			result.push(line);
			if (!this.char) break;
			this.index++;
		}
		return result.join("<br>");
	}
	private parseComment () {
		if (this.consume(Regex.CommentBlock))
			return this.parseCommentBlock(this.indent);
		this.consumeChar(Char.Comment);
		const keep = this.consumeChar(Char.Comment);
		let result = "";
		for (; this.char && this.char != "\n" && (!keep || (result += this.char)); this.index++);
		return result ? `<!-- ${result.trim()} -->` : result;
	}
	private parseCommentBlock (untilIndent: number) {
		const keep = this.consumeChar(Char.Comment);
		const wasNewline = this.consume(Regex.WhitespaceUntilNewLine);
		let result = "";
		const start = this.index;
		CommentLoop: while (true) {
			if (this.index == start && !wasNewline) {
				this.indent = untilIndent;
			} else {
				this.indent = 0;
				for (; this.char == "\t"; this.index++ , this.indent++);
				if (this.char == Char.Comment && this.consume(Regex.CommentBlock)) break;
			}
			if (this.char != "\n" && this.indent <= untilIndent && this.index != start) break;
			for (; this.char && this.char != "\n" && (!keep || this.char == Char.Comment || (result += this.char)); this.index++)
				if (this.char == Char.Comment && this.consume(Regex.CommentBlock)) break CommentLoop;
			if (keep) result += "\n";
			if (!this.char) break;
			this.index++;
		}
		return result ? `<!--\n${result.trim()}\n-->` : result;
	}

	private async parseCall () {
		const index = this.index;
		const variableName = this.extract(Regex.Word);
		const attributes = await this.parseAttributes();
		switch (variableName) {
			case "content": {
				return this.options.importContent || "";
			}
			case "import": {
				const args = attributes as ImportArgs;
				let importPath = args.src;
				let ext = args.language || args.lang || path.extname(importPath).slice(1);
				if (!ext) {
					if ("script" in args) ext = "js";
					else if ("style" in args) ext = "css";
					else ext = "hot";
				}
				if (path.extname(importPath) == "" && !/^https?:\/\//.test(importPath)) {
					importPath += "." + ext;
				}

				let outDir: string, relativePath = importPath;

				if (this.file) {
					const isAbsolute = /^https?:\/\//.test(importPath) || path.isAbsolute(importPath) || importPath[0] == "/";
					if (!isAbsolute) {
						importPath = path.resolve(path.dirname(this.file), importPath);
					}

					outDir = path.dirname(this.outFile);

					if (!isAbsolute)
						relativePath = path.relative(outDir, path.resolve(outDir, importPath));
				}

				let resultAttributes = makeAttributeString(args, "language", "lang", "script", "style", "template", "src");
				if (resultAttributes.length > 0) resultAttributes = " " + resultAttributes;

				switch (ext) {
					case "js": {
						return `<script src="${relativePath}"${resultAttributes}></script>`;
					}
					case "css": {
						return `<link rel="stylesheet" href="${relativePath}"${resultAttributes}/>`;
					}
					case "hot": {
						if (!this.file)
							throw new Error("Can't import a hot file when parsing a hot string.");

						const files = await glob(importPath, { cwd: importPath, absolute: true } as any);

						let importContent = "";
						if (files.length) {
							if (this.consumeChar(Char.ElementChildren)) {
								const child = this.consumeChar(Char.ElementChild);
								const content = await this.parseChildren(this.indent, "");
								importContent += child ? content.trim() : content;
							}
						}

						let result = "";
						for (const file of files) {

							const hot = new Hot(this.config);
							await hot.setFile(file);
							const srcRoot = commondir([path.resolve(this.config.srcRoot), path.resolve(file)]);

							const relativeOutPath = path.relative(srcRoot, replaceExt(file, "html"));
							const outPath = path.resolve(srcRoot, "./" + (this.config.outDir || ""), relativeOutPath);

							let fileResult = await hot.compile(outPath, !!(this.config.compileAll && this.outFile), { importContent });
							if ("template" in args) {
								fileResult = `<template${resultAttributes}>${fileResult}</template>`;
							}
							result += fileResult + "\n";
						}

						return result.slice(0, -1);
					}
				}
			}
		}
		this.throw(`Undefined variable '${variableName}' cannot be called`, index);
	}
}

module Hot {
	export function parse (hotText: string) {
		return new Hot().parse(hotText);
	}
	async function getConfig (dir: string): Promise<Config | Config[]> {
		try {
			return JSON.parse(await fs.readFile(path.join(dir, "hotconfig.json"), "utf8")) as Config | Config[];
		} catch (err) {
			return null;
		}
	}
	export async function compile (...compilePaths: string[]) {
		if (compilePaths.length == 0) compilePaths.push(".");
		for (const compilePath of compilePaths) {
			const stats = await fs.stat(compilePath);
			if (stats.isDirectory()) {
				let configs = await getConfig(compilePath);
				if (!Array.isArray(configs)) configs = [configs ? configs : { files: "./*.hot" }];

				const promises: Promise<any>[] = [];

				for (const config of configs as Config[]) {
					const files = config.files ?
						await glob(config.files, { cwd: compilePath, absolute: true } as any)
						: [path.resolve(compilePath, config.file)];
					if (files.length > 0) {
						// files is an array of filenames to compile
						// srcRootRelative is set to the common directory of all given files
						const srcRootRelative = config.outDir && files.length > 1 ? commondir(files) : path.dirname(files[0]);

						config.srcRoot = path.resolve(compilePath, srcRootRelative);

						for (const file of files) {
							const hot = new Hot(config);

							let outPath: string;
							if (config.out) {
								outPath = path.resolve(compilePath, config.out);
							} else if (config.outDir) {
								const relativeFile = path.relative(config.srcRoot, file);
								outPath = path.resolve(compilePath, config.outDir, "./" + replaceExt(relativeFile, "html"));
							}

							debug && console.log(file, "=>", outPath);

							promises.push(hot.setFile(file).catch((err) => {
								console.log(debug ? err : err.message);
							}).then(() => {
								return hot.compile(outPath).catch((err) => {
									console.log(debug ? err : err.message);
								});
							}));
						}
					} else {
						console.log("Found no files to compile.");
					}
				}

				await Promise.all(promises);

			} else {
				const hot = new Hot({
					srcRoot: path.dirname(compilePath),
				});
				await hot.setFile(compilePath);
				return hot.compile().catch((err) => {
					console.log(debug ? err : err.message);
				});
			}

		}
	}
	export type Config = {
		files?: string;
		file?: string;
		out?: string;
		outDir?: string;
		compileAll?: true;
		srcRoot?: string;
	};

	export interface HotParseOptions {
		importContent?: string;
	}
}

export = Hot;

if (require.main == module) {
	const args = process.argv.slice(2).filter((arg) => {
		if (arg == "-debug") {
			debug = true;
			return false;
		}
		return true;
	});
	if (args.length == 0) {
		console.log(`
Usage:

hot <hotFilePath>
 - compiles a hot file, the file does not need to have the .hot extension

hot <folderPath>
 - compiles all .hot files in the folder, or uses the folder's hotconfig.json to choose which hotfiles to compile to what locations

Note: Any additional paths provided as arguments are also compiled in these ways.
		`);
	}
	Hot.compile(...args);
}
