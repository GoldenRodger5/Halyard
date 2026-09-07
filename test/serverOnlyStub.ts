/**
 * §567. `server-only` outside Next.
 *
 * The package exists to make a build fail when server code is imported into a
 * client bundle. Under vitest there is no bundle and no client, so importing it
 * fails to resolve and takes the whole suite file with it — which is how a
 * module under `apps/web/src/lib` becomes untestable for a reason that has
 * nothing to do with the module. An empty stub restores the only thing that
 * matters here: the code under test runs.
 */
export {};
