declare module "commondir" {
	function commondir (absolutePaths: string[]): string;
	function commondir (basedir: string, relativePaths: string[]): string;

	export = commondir;
}