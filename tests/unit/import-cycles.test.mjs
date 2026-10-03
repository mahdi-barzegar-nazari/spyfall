/**
 * Static check of the module graph under js/: no import cycles, and core/ never imports upward.
 * Needs only Node: it reads the source text, it does not execute the modules.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Every module specifier a source file loads: static imports, re-exports, side-effect and dynamic imports. */
function parseSpecifiers(source) {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const specifiers = new Set();
    for (const m of code.matchAll(/^\s*(?:import|export)\s[^'";]*?\bfrom\s*['"]([^'"]+)['"]/gm)) specifiers.add(m[1]);
    for (const m of code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) specifiers.add(m[1]);
    for (const m of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) specifiers.add(m[1]);
    return [...specifiers];
}

function listJsFiles(dir) {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        return statSync(full).isDirectory() ? listJsFiles(full) : full.endsWith('.js') ? [full] : [];
    });
}

/** Map of "js/..." path -> the "js/..." paths it imports, plus every relative import that points nowhere. */
function buildGraph(root) {
    const toName = (file) => relative(root, file).split(sep).join('/');
    const graph = new Map();
    const unresolved = [];
    for (const file of listJsFiles(join(root, 'js'))) {
        const edges = new Set();
        for (const spec of parseSpecifiers(readFileSync(file, 'utf8'))) {
            if (!spec.startsWith('.')) continue;
            const target = resolve(dirname(file), spec);
            if (existsSync(target) && statSync(target).isFile()) edges.add(toName(target));
            else unresolved.push(`${toName(file)} imports missing ${spec}`);
        }
        graph.set(toName(file), [...edges].sort());
    }
    return { graph, unresolved };
}

/** One shortest cycle per cyclic strongly-connected component, each as ['a.js', 'b.js', 'a.js']. */
function findCycles(graph) {
    const index = new Map();
    const low = new Map();
    const stack = [];
    const onStack = new Set();
    const components = [];
    let counter = 0;

    function visit(node) {
        index.set(node, counter);
        low.set(node, counter);
        counter++;
        stack.push(node);
        onStack.add(node);
        for (const next of graph.get(node) || []) {
            if (!index.has(next)) {
                visit(next);
                low.set(node, Math.min(low.get(node), low.get(next)));
            } else if (onStack.has(next)) {
                low.set(node, Math.min(low.get(node), index.get(next)));
            }
        }
        if (low.get(node) === index.get(node)) {
            const component = [];
            let member;
            do {
                member = stack.pop();
                onStack.delete(member);
                component.push(member);
            } while (member !== node);
            const selfLoop = component.length === 1 && (graph.get(node) || []).includes(node);
            if (component.length > 1 || selfLoop) components.push(component.sort());
        }
    }
    for (const node of graph.keys()) if (!index.has(node)) visit(node);

    return components.map((component) => {
        const members = new Set(component);
        const start = component[0];
        const previous = new Map([[start, null]]);
        const queue = [start];
        while (queue.length) {
            const node = queue.shift();
            for (const next of graph.get(node) || []) {
                if (!members.has(next)) continue;
                if (next === start) {
                    const path = [];
                    for (let at = node; at !== null; at = previous.get(at)) path.unshift(at);
                    return [...path, start];
                }
                if (!previous.has(next)) {
                    previous.set(next, node);
                    queue.push(next);
                }
            }
        }
        return [...component, start];
    });
}

const formatCycle = (cycle) => cycle.join(' -> ');

describe('module graph of js/', () => {
    const { graph, unresolved } = buildGraph(ROOT);

    it('is actually being read (guards against a parser that silently finds nothing)', () => {
        assert.ok(graph.size >= 30, `only ${graph.size} modules found`);
        assert.ok(graph.get('js/main.js').length >= 5, 'main.js should import its start-up modules');
        assert.ok(graph.get('js/ui/bindings.js').includes('js/core/dispatch.js'), 'bindings.js imports dispatch from core/dispatch.js');
    });

    it('has no relative import that points at a missing file', () => {
        assert.deepEqual(unresolved, []);
    });

    it('has no import cycles', () => {
        const cycles = findCycles(graph).map(formatCycle);
        assert.equal(cycles.length, 0, `import cycle(s) found:\n  ${cycles.join('\n  ')}`);
    });

    it('never lets core/ import from game/, ui/ or app/', () => {
        const upward = [];
        for (const [file, imports] of graph) {
            if (!file.startsWith('js/core/')) continue;
            for (const target of imports) {
                if (/^js\/(game|ui|app)\//.test(target)) upward.push(`${file} -> ${target}`);
            }
        }
        assert.deepEqual(upward, [], 'core/ must stay below game/, ui/ and app/; inject the dependency instead');
    });

    it('keeps i18n/ a leaf layer: it never imports from game/, ui/ or app/', () => {
        assert.ok([...graph.keys()].some((file) => file.startsWith('js/i18n/')), 'js/i18n/ was not found in the module graph');
        const upward = [];
        for (const [file, imports] of graph) {
            if (!file.startsWith('js/i18n/')) continue;
            for (const target of imports) {
                if (/^js\/(game|ui|app)\//.test(target)) upward.push(`${file} -> ${target}`);
            }
        }
        assert.deepEqual(upward, [], 'i18n/ must stay below game/, ui/ and app/');
    });
});

describe('cycle detector (self-check on throwaway trees)', () => {
    function withTree(files, run) {
        const root = mkdtempSync(join(tmpdir(), 'spyfall-graph-'));
        try {
            for (const [name, source] of Object.entries(files)) {
                const file = join(root, 'js', name);
                mkdirSync(dirname(file), { recursive: true });
                writeFileSync(file, source);
            }
            return run(buildGraph(root));
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    }

    it('reports a three-module cycle and a self-import, and nothing for acyclic code', () => {
        withTree(
            {
                'a.js': "import { b } from './b.js';\nexport const a = 1;\n",
                'b.js': "import { c } from './c.js';\nexport const b = 1;\n",
                'c.js': "import { a } from './a.js';\nexport const c = 1;\n",
                'self.js': "import { x } from './self.js';\nexport const x = 1;\n",
                'leaf.js': 'export const leaf = 1;\n',
                'top.js': "import { leaf } from './leaf.js';\nimport { a } from './a.js';\nexport const t = leaf + a;\n"
            },
            ({ graph }) => {
                const cycles = findCycles(graph).map(formatCycle).sort();
                assert.deepEqual(cycles, ['js/a.js -> js/b.js -> js/c.js -> js/a.js', 'js/self.js -> js/self.js']);
            }
        );
        withTree(
            { 'a.js': "import './b.js';\n", 'b.js': "export * from './c.js';\n", 'c.js': 'export const c = 1;\n' },
            ({ graph }) => assert.deepEqual(findCycles(graph), [])
        );
    });

    it('sees multi-line imports, re-exports, side-effect and dynamic imports, and ignores comments', () => {
        withTree(
            {
                'a.js': [
                    '/* import { x } from "./ghost-block.js"; */',
                    "// import { y } from './ghost-line.js';",
                    'import {',
                    '    one,',
                    '    two',
                    "} from './multi.js';",
                    "export { z } from './reexport.js';",
                    "import './effect.js';",
                    "const lazy = () => import('./dynamic.js');"
                ].join('\n'),
                'multi.js': 'export const one = 1, two = 2;',
                'reexport.js': 'export const z = 1;',
                'effect.js': '',
                'dynamic.js': ''
            },
            ({ graph, unresolved }) => {
                assert.deepEqual(unresolved, []);
                assert.deepEqual(graph.get('js/a.js'), ['js/dynamic.js', 'js/effect.js', 'js/multi.js', 'js/reexport.js']);
            }
        );
    });

    it('flags a relative import that points at a missing file', () => {
        withTree({ 'a.js': "import { b } from './nope.js';\n" }, ({ unresolved }) => {
            assert.deepEqual(unresolved, ['js/a.js imports missing ./nope.js']);
        });
    });
});
