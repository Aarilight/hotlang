declare module "mkdirp-promise" {
	import fs = require("fs");

	interface IOptions {
		mode?: string;
		fs?: {
			mkdirSync (path: string, mode: string): void;
			statSync (path: string): fs.Stats;
		};
	}
	function mkdirp (dir: string): Promise<void>;
	function mkdirp (dir: string, options: IOptions): Promise<void>;

	export = mkdirp;
}