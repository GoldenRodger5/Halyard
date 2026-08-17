/**
 * The fact base: what the source code actually contains.
 *
 * ## Why the TypeScript compiler and not grep
 *
 * The previous audit in `docs/AUDIT.md` was done by counting callers with
 * `grep`, and it was wrong twice in opposite directions. It reported
 * `factCheckTake` as orphaned because the query was `factCheck(`, which does
 * not match `factCheckTake(`. It reported the rejection clusterer as wired
 * because the count included `.next` build output — compiled copies of the same
 * source, counted as if they were callers.
 *
 * Both are failures of the *tool*, not of care. A regex cannot tell a
 * declaration from a call, a comment from code, or a build artefact from a
 * source file. An auditor built on one would produce a truth machine whose
 * output has to be double-checked by hand, which is not a truth machine.
 *
 * So this walks the real TypeScript AST. `typescript` is already a dependency
 * of every package here, so this costs nothing new.
 *
 * ## What counts as a caller
 *
 * A call site in a **non-test, non-build** source file. Tests are excluded
 * deliberately and it is the most important decision in this file: a function
 * called only by its own test is exactly the phantom capability this system
 * exists to name. Counting tests as callers would make every orphan green.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export interface SourceFact {
  /** Repo-relative, POSIX separators. */
  file: string;
  isTest: boolean;
}

export interface SymbolFact extends SourceFact {
  name: string;
  exported: boolean;
  line: number;
}

export interface CallFact extends SourceFact {
  /** The identifier being called: `writeDraft`, or `obj.method` → `method`. */
  callee: string;
  line: number;
  /** The nearest enclosing function or method, for a readable caller name. */
  enclosing: string | null;
}

export interface StringFact extends SourceFact {
  value: string;
  line: number;
}

/**
 * A named import, which is how a server action gets wired.
 *
 * Next.js server actions are *referenced*, never called: a page imports the
 * action and passes it as `<form action={draftFind}>`. There is no call
 * expression anywhere, so a call-graph-only auditor reports every server action
 * as an orphan — which it did, for two real and working agents, before this
 * existed.
 */
export interface ImportFact extends SourceFact {
  name: string;
  from: string;
  line: number;
}

export interface FactBase {
  files: SourceFact[];
  /** Every exported function, class and const across the scanned source. */
  symbols: SymbolFact[];
  /** Every call expression. */
  calls: CallFact[];
  /** Every string literal, used to find prompt versions and table names. */
  strings: StringFact[];
  /** Every named import, so a referenced-but-never-called symbol is visible. */
  imports: ImportFact[];
  /**
   * String literals that are genuinely prompt versions.
   *
   * Recognised by position, not by shape. The first version matched anything
   * looking like `name.v1`, which swept up the eleven `FORMAT_SPECS` version
   * strings and reported each as an unregistered agent — eleven confident,
   * specific, wrong findings. A version string is a prompt version when it is
   * assigned to a `promptVersion` property or initialises a `*_PROMPT_VERSION`
   * constant, and not otherwise.
   */
  promptVersions: StringFact[];
}

const IGNORED_DIRS = new Set(['node_modules', '.next', 'dist', '.git', '.turbo', 'coverage']);

/** A test or spec file. Never counts as a caller. */
export function isTestFile(file: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(file) || file.includes('/__tests__/');
}

function walkDir(root: string, dir: string, out: string[]): void {
  const entries = ts.sys.readDirectory(dir, ['.ts', '.tsx'], undefined, undefined, 1);
  for (const entry of entries) out.push(entry);

  for (const child of ts.sys.getDirectories(dir)) {
    if (IGNORED_DIRS.has(path.basename(child))) continue;
    walkDir(root, path.join(dir, child), out);
  }
}

/** Every source file under the given roots, excluding build output. */
export function collectSourceFiles(repoRoot: string, roots: string[]): string[] {
  const found: string[] = [];
  for (const root of roots) {
    const abs = path.join(repoRoot, root);
    if (!ts.sys.directoryExists(abs)) continue;
    walkDir(repoRoot, abs, found);
  }
  return found
    .filter((f) => !f.split(path.sep).some((part) => IGNORED_DIRS.has(part)))
    .map((f) => path.relative(repoRoot, f).split(path.sep).join('/'))
    .sort();
}

/**
 * The name being called, reduced to something comparable.
 *
 * `writeDraft(...)` → `writeDraft`. `client.describeFrames(...)` →
 * `describeFrames`. The property name rather than the full path because an
 * interface method is called through whatever variable holds it, and the
 * variable name is not stable information.
 */
function calleeName(node: ts.CallExpression): string | null {
  const expr = node.expression;
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return null;
}

/** The nearest named function enclosing a node, for a readable caller. */
function enclosingName(node: ts.Node): string | null {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      (ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) &&
      current.name &&
      ts.isIdentifier(current.name)
    ) {
      return current.name.text;
    }
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return current.name.text;
    }
    current = current.parent;
  }
  return null;
}

function isExported(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return Boolean(modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

/** Build the fact base by parsing every file. */
export function scan(repoRoot: string, roots: string[]): FactBase {
  const files = collectSourceFiles(repoRoot, roots);
  const facts: FactBase = {
    files: [],
    symbols: [],
    calls: [],
    strings: [],
    imports: [],
    promptVersions: [],
  };

  for (const file of files) {
    const isTest = isTestFile(file);
    facts.files.push({ file, isTest });

    let text: string;
    try {
      text = readFileSync(path.join(repoRoot, file), 'utf8');
    } catch {
      continue;
    }

    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const lineOf = (node: ts.Node): number =>
      source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

    const visit = (node: ts.Node): void => {
      if (
        (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
        node.name &&
        ts.isIdentifier(node.name)
      ) {
        facts.symbols.push({
          file,
          isTest,
          name: node.name.text,
          exported: isExported(node),
          line: lineOf(node),
        });
      }

      if (ts.isVariableStatement(node)) {
        const exported = isExported(node);
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            facts.symbols.push({
              file,
              isTest,
              name: decl.name.text,
              exported,
              line: lineOf(decl),
            });
          }
        }
      }

      /** Class methods, so `describeFrames` on a client class is findable. */
      if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
        facts.symbols.push({
          file,
          isTest,
          name: node.name.text,
          exported: true,
          line: lineOf(node),
        });
      }

      if (ts.isCallExpression(node)) {
        const callee = calleeName(node);
        if (callee) {
          facts.calls.push({
            file,
            isTest,
            callee,
            line: lineOf(node),
            enclosing: enclosingName(node),
          });
        }
      }

      if (ts.isImportDeclaration(node) && node.importClause?.namedBindings) {
        const bindings = node.importClause.namedBindings;
        const from = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : '';
        if (ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            facts.imports.push({ file, isTest, name: element.name.text, from, line: lineOf(element) });
          }
        }
      }

      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        facts.strings.push({ file, isTest, value: node.text, line: lineOf(node) });

        const parent = node.parent;
        const isPromptVersionProperty =
          parent &&
          ts.isPropertyAssignment(parent) &&
          ts.isIdentifier(parent.name) &&
          parent.name.text === 'promptVersion';
        const isPromptVersionConst =
          parent &&
          ts.isVariableDeclaration(parent) &&
          ts.isIdentifier(parent.name) &&
          /_PROMPT_VERSION$/.test(parent.name.text);

        if (isPromptVersionProperty || isPromptVersionConst) {
          facts.promptVersions.push({ file, isTest, value: node.text, line: lineOf(node) });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return facts;
}

// ── Queries over the fact base ─────────────────────────────────────────────

/** Where a symbol is defined. Prefers a non-test definition. */
export function findDefinition(facts: FactBase, name: string): SymbolFact | null {
  const matches = facts.symbols.filter((s) => s.name === name);
  return matches.find((s) => !s.isTest) ?? matches[0] ?? null;
}

/**
 * Call sites for a symbol, excluding tests and true self-recursion.
 *
 * **A caller in the same file still counts.** The first version excluded the
 * whole definition file to avoid counting recursion, and that silently dropped
 * every same-module caller — `runTakeLoop` calling `factCheckTake` twelve lines
 * below it was reported as no-caller for three agents that work perfectly.
 *
 * Only a call whose *enclosing function is the symbol itself* is recursion.
 */
export function findCallers(facts: FactBase, name: string): CallFact[] {
  return facts.calls.filter((c) => c.callee === name && !c.isTest && c.enclosing !== name);
}

/**
 * Non-test files that import a symbol without necessarily calling it.
 *
 * The wiring signal for anything referenced rather than invoked — server
 * actions, route handlers, components passed as props.
 */
export function findImporters(facts: FactBase, name: string): ImportFact[] {
  return facts.imports.filter((i) => i.name === name && !i.isTest);
}

/** Call sites inside test files — proof of coverage, never proof of a caller. */
export function findTestCallers(facts: FactBase, name: string): CallFact[] {
  return facts.calls.filter((c) => c.callee === name && c.isTest);
}

/** Every file containing a given string literal. */
export function filesContainingString(facts: FactBase, value: string): StringFact[] {
  return facts.strings.filter((s) => s.value === value);
}
