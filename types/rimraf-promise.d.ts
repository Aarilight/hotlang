declare module "rmfr" {
	import fs = require("fs");

	interface IOptions {
		maxBusyTries?: number;
		emfileWait?: number;
		glob?: true;
	}
	function rimraf (dir: string): Promise<void>;
	function rimraf (dir: string, options: IOptions): Promise<void>;

	export = rimraf;
}