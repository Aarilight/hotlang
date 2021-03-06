# hotlang
[![npm](https://img.shields.io/npm/v/hotlang.svg?style=flat-square)](https://www.npmjs.com/package/hotlang)
[![GitHub issues](https://img.shields.io/github/issues/Yuudaari/hotlang.svg?style=flat-square)](https://github.com/Yuudaari/hotlang)
[![Travis](https://img.shields.io/travis/Yuudaari/hotlang.svg?style=flat-square)](https://travis-ci.org/Yuudaari/hotlang)

It's hot. Not scalding, like HTML.

## Installing and Usage:

```bat
npm install hotlang
hot exampleFile.hot
```

## Command line API:

### `hot <filePath>`
Compiles a hot file, the file does not need to have the hot extension

### `hot <folderPath>`
If a hotconfig.json file is present, uses this file to determine which files to compile. Otherwise, compiles all .hot files in the folder.

### `hot <...paths>`
Takes any number of paths (separated by spaces). Each path is compiled, if it is a file, or its contents are compiled, if it is a folder.

## hotconfig.json 

```ts
interface CompileConfig {
	files?: Glob;
	file?: string;
	out?: string;
	outDir?: string;
	compileAll?: true;
	srcRoot?: string;
};
type HotConfigJson = CompileConfig | CompileConfig[];
```

The `hotconfig.json` should contain an array of CompileConfigs or a single CompileConfig, specifying what to compile, and how to do it.

### CompileConfig.files
Takes a Glob, points to the files which should be compiled.

### CompileConfig.file
Points to the file which should be compiled.

### CompileConfig.out
If set, the resulting HTML will be in this file.

### CompileConfig.outDir
If set, the resulting HTML files will be placed into this directory, with names based on their .hot file names. Ex: `file.hot -> file.html`

### CompileConfig.compileAll
If set to true, all Hot files imported are compiled into this directory. (Not just the one(s) requested with `CompileConfig.files` or `CompileConfig.file`)

# The Language

The point of Hot is to make HTML simpler and easier to maintain. As a result this can reduce the temptation to do too much document generation in JavaScript, and therefore keep your document/scripts/styles separate.

The syntax of Hot is inspired by CSS selectors. Here's a simple example:
```hot
button#title.giant: "Amazing App Name"
```
This compiles to this html:
```html
<button id="title" class="giant">
	Amazing App Name
</button>
```

Attributes are slightly different than with CSS selectors:
```hot
button[title: "Home", aria-label: "Home"]: "Home"
```

```html
<button title="Home" aria-label="Home">
	Home
</button>
```

To do an attribute without a value, format like this:

```hot
div[no-val; also-no-val]
```

```html
<div no-val also-no-val></div>
```

To create an element with no whitespace between its children:

```hot
div:= "I'm all alone!"
```

```html
<div>I'm all alone!</div>
```

```hot
div:= 
	"I'm sandwiched here!"
	span: "muahhahaha"
```

```html
<div>I'm sandwiched here!<span>
	muahhahaha
</span></div>
```

Single-line and block comments:

```hot
# comment
###
	Block comment!
	Allows multiple lines.
```

```hot
### Block comments can also start on the same line.
div: "And be only one line long."
```

You can also end a block comment prematurely/explicitly by using the triple hash, either on the same line or the following.

```hot
###
	Block comment! ###
```

```hot	
###
	Block comment!
###
```

You can keep comments in the output by appending an additional hash to them. For example:

```hot
## This comment appears in the output!
```

```html
<!-- This comment appears in the output! -->
```

Or, with a block:

```hot
####
	This comment appears
	in the output!
```

```html
<!--
This comment appears
in the output!	
-->
```


## Importing other files

```hot
# world.hot
span: "world!"
```

```hot
# hello.hot
div: 
	span: "Hello,"
	!import[src: "./world"]
```

Resulting html of compiling `hello.hot`:
```html
<div>
	<span>Hello,</span>
	<span>world!</span>
</div>
```

### Passing content in to imported hot files
```hot
# helloworld.hot
!import[src: "./hello"]: "world"
```

```hot
# hello.hot
span:= "Hello, " !content "!"
```

```html
# helloworld.html
<span>Hello, world!</span>
```

### Importing Stylesheets and Scripts:

#### Javascript
```hot
!import[script; src: "./main"]
```
```html
<script src="./main.js"></script>
```

#### CSS
```hot
!import[style; src: "./main"]
```
```html
<link rel="stylesheet" href="./main.css"/>
```

### Importing all hot files in a folder
```hot
!import[src: "./folder/*"]
```
All `hot` files in the folder are compiled and inserted into the resulting document. The order of the imported files is not guaranteed.

## Block strings

```hot
p: """
	This is all text that will be in this paragraph element.
	This is a second line of text in the paragraph. 
```
```html
<p>This is all text that will be in this paragraph element.<br>This is a second line of text in the paragraph.</p>
```

## MIT License

[Copyright 2017 Mackenzie McClane](./LICENSE)