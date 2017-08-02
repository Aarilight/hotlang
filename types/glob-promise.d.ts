declare module "glob-promise" {
	import nodeGlob = require("glob");

	interface IOptions extends nodeGlob.IOptions {
		absolute?: true;
	}

	function glob (pattern: string, options?: IOptions): Promise<string[]>;
	module glob {
		export const promise: typeof glob;
		export const glob: typeof nodeGlob;
		export const sync: typeof nodeGlob.sync;
		export const hasMagic: typeof nodeGlob.hasMagic;
		export const Glob: typeof nodeGlob.Glob;
	}
	export = glob;
}