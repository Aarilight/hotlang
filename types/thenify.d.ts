declare module "thenify" {
	function thenify (asyncFunction: Function): (...args: any[]) => Promise<any>;
	function thenify (asyncFunction: Function, options: Options): (...args: any[]) => Promise<any>;

	interface Options {
		withCallback?: true;
		multiArgs?: false | string[];
	}

	module thenify {
		export function withCallback (asyncFunction: Function): (...args: any[]) => Promise<any>;
	}

	export = thenify;
}