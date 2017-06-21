function tabbify (str: string, amount = 1) {
	return str.replace(/^|(\n)/g, "$1\t");
}

const Regex = {
	Whitespace: /^\s+/,
	WhitespaceUntilNewLine: /^[ \t]+\n/,
	Word: /^[a-z][a-z0-9-]*/,
	StringBlock: /^"""/,

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
};

interface LastMatchSave {
	regex: RegExp;
	length: number;
}

class Parser {

	line: number;
	indent: number;
	input: string;
	index: number;
	lastMatch: LastMatchSave;

	constructor(hotText: string) {
		this.input = hotText.replace(/\r/g, "");
	}

	get char () {
		return this.input[this.index];
	}
	matches (reg: RegExp) {
		const match = this.input.slice(this.index).match(reg);
		if (!match) return 0;
		const result = match[0].length;
		this.lastMatch = {
			regex: reg,
			length: result,
		};
		return result;
	}
	extract (reg: RegExp) {
		if (this.lastMatch === undefined || this.lastMatch.regex !== reg) this.matches(reg);
		if (this.lastMatch === undefined) this.throw(`Expected ${Regex.getNameOf(reg)}`);
		const result = this.input.slice(this.index, this.index + this.lastMatch.length);
		this.index += this.lastMatch.length;
		this.lastMatch = undefined;
		return result;
	}
	consume (reg: RegExp) {
		const match = this.input.slice(this.index).match(reg);
		if (match) {
			this.index += match[0].length;
			this.lastMatch = undefined;
			if (reg === Regex.Whitespace) {
				const lines = match[0].split("\n");
				this.line += lines.length - 1;
				if (lines.length > 1) {
					const currentLine = lines.pop();
					this.indent = currentLine.split("\t").length;
				}

			}
			return true;
		}
		return false;
	}
	consumeChar (char: string) {
		if (this.char == char) {
			this.index++;
			this.lastMatch = undefined;
			return true;
		}
		return false;
	}

	throw (message = "Error") {
		const split = this.input.slice(0, this.index).split("\n");
		const lineNumber = split.length;
		const column = split[lineNumber - 1].length;
		const beginningOfLine = split.pop();
		const line = beginningOfLine + this.input.slice(this.index).split("\n")[0];
		console.log(line);
		console.log(" ".repeat(beginningOfLine.match(/^\t*/)[0].length * 3 + beginningOfLine.length) + "^");
		console.log("\n");
		throw new Error(`${message} at [${lineNumber}:${column}]`);
	}

	parse () {
		this.line = 0;
		this.index = 0;
		this.indent = 0;
		return this.parseChildren(-1);
	}
	parseChildren (untilIndent: number) {
		let result = "";
		const line = this.line;
		this.consume(Regex.Whitespace);
		while ((this.indent > untilIndent || line == this.line) && this.index < this.input.length) {
			result += "\n" + this.parseExpression();
			this.consume(Regex.Whitespace);
		}
		return result.slice(1);
	}
	parseExpression () {
		this.consume(Regex.Whitespace);
		switch (this.char) {
			case Char.String: {
				return this.parseString();
			}
			case Char.Comment: {
				return this.parseComment();
			}
			default: {
				if (this.matches(Regex.Word)) {
					return this.parseElement();
				}
				else {
					this.throw(`Invalid character: ${this.char}`);
				}
			}
		}
	}
	parseElement () {
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
		if (this.consumeChar(Char.AttributeStart)) {
			this.consume(Regex.Whitespace);
			while (!this.consumeChar(Char.AttributeEnd)) {
				const attribute = this.extract(Regex.Word);
				if (this.consumeChar(Char.AttributeVal)) {
					this.consume(Regex.Whitespace);
					const value = this.parseExpression();
					result += ` ${attribute}="${value}"`;
					this.consumeChar(Char.Additional);
				} else {
					result += ` ${attribute}`;
					this.consumeChar(Char.AttributeNoValAdditional);
				}
				this.consume(Regex.Whitespace);
			}
		}
		result += ">";
		if (this.consumeChar(Char.ElementChildren)) {
			result += "\n" + tabbify(this.parseChildren(this.indent)) + "\n";
		}
		result += `</${elementName}>`;
		return result;
	}
	parseString () {
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
	parseStringBlock (untilIndent: number) {
		let result = "";
		this.consume(Regex.WhitespaceUntilNewLine);
		while (true) {
			this.indent = 0;
			for (; this.char == "\t"; this.index++) {
				this.indent++;
				if (this.indent > untilIndent + 1) result += "\t";
			}
			if (this.indent <= untilIndent) break;
			for (; this.char != "\n"; result += this.char, this.index++);
			this.index++;
		}
		return result;
	}
	parseComment () {
		this.consumeChar(Char.Comment);
		for (; this.char != "\n"; this.index++);
		return "";
	}
}

export = function parse (hotText: string) {
	return new Parser(hotText).parse();
};