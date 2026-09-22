import ts from 'typescript';

const root = `${import.meta.dir}/../../..`;
const oxfmt = `${root}/node_modules/.bin/oxfmt`;
const checkOnly = Bun.argv.includes('--check');
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);
const ignoredDirectories = new Set(['build', 'dist', 'drizzle', 'generated', 'node_modules']);

function parse(source: string, filePath: string) {
    return ts.createSourceFile(
        filePath,
        source,
        ts.ScriptTarget.Latest,
        true,
        filePath.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
}

function lineIndent(source: string, position: number) {
    const lineStart = source.lastIndexOf('\n', position - 1) + 1;
    return source.slice(lineStart, position).match(/^[\t ]*/)?.[0] ?? '';
}

function lastSeparator(gap: string) {
    const matches = [...gap.matchAll(/[,;:]/g)];
    return matches.at(-1)?.[0] ?? '';
}

function getLayout(node: ts.Node, sourceFile: ts.SourceFile) {
    const children = node.getChildren(sourceFile);
    const open = children.find((child) =>
        [ts.SyntaxKind.OpenBraceToken, ts.SyntaxKind.OpenParenToken].includes(child.kind)
    );
    const close = children.find((child) =>
        [ts.SyntaxKind.CloseBraceToken, ts.SyntaxKind.CloseParenToken].includes(child.kind)
    );
    let items: readonly ts.Node[] | undefined;
    if (ts.isObjectLiteralExpression(node)) {
        items = node.properties;
    } else if (ts.isObjectBindingPattern(node)) {
        items = node.elements;
    } else if (
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeLiteralNode(node) ||
        ts.isClassDeclaration(node) ||
        ts.isClassExpression(node) ||
        ts.isEnumDeclaration(node)
    ) {
        items = node.members;
    } else if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        items = node.arguments;
    }

    if (!open || !close || !items || items.length < 2) {
        return undefined;
    }

    const openPosition = open.getStart(sourceFile);
    const closePosition = close.getStart(sourceFile);
    const itemStarts = items.map((item) => item.getStart(sourceFile));
    const itemEnds = items.map((item) => item.getEnd());
    const baseIndent = lineIndent(sourceFile.text, openPosition);
    const itemIndent = `${baseIndent}    `;
    const gaps = [
        sourceFile.text.slice(open.getEnd(), itemStarts[0]!),
        ...itemEnds
            .slice(0, -1)
            .map((end, index) => sourceFile.text.slice(end, itemStarts[index + 1]!)),
        sourceFile.text.slice(itemEnds.at(-1)!, closePosition),
    ];

    if (gaps.some((gap) => gap.includes('//') || gap.includes('/*'))) {
        return undefined;
    }

    const expectedGaps = [
        `\n${itemIndent}`,
        ...itemEnds.slice(0, -1).map((end, index) => {
            const gap = sourceFile.text.slice(end, itemStarts[index + 1]!);
            return `${lastSeparator(gap)}\n${itemIndent}`;
        }),
        (() => {
            const gap = sourceFile.text.slice(itemEnds.at(-1)!, closePosition);
            return `${lastSeparator(gap)}\n${baseIndent}`;
        })(),
    ];

    if (gaps.every((gap, index) => gap === expectedGaps[index])) {
        return undefined;
    }

    return { closePosition, expectedGaps, gaps, itemEnds, itemStarts, openEnd: open.getEnd() };
}

function expandOneStructure(source: string, filePath: string) {
    const sourceFile = parse(source, filePath);
    let edits: { end: number; start: number; text: string }[] | undefined;

    function visit(node: ts.Node) {
        if (edits) return;

        const layout = getLayout(node, sourceFile);
        if (layout) {
            const boundaries = [
                [layout.openEnd, layout.itemStarts[0]!],
                ...layout.itemEnds
                    .slice(0, -1)
                    .map((end, index) => [end, layout.itemStarts[index + 1]!]),
                [layout.itemEnds.at(-1)!, layout.closePosition],
            ];
            edits = boundaries.map(([start, end], index) => ({
                end,
                start,
                text: layout.expectedGaps[index]!,
            }));
            return;
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    if (!edits) return undefined;

    let formatted = source;
    for (const edit of [...edits].reverse()) {
        formatted = `${formatted.slice(0, edit.start)}${edit.text}${formatted.slice(edit.end)}`;
    }
    return formatted;
}

function verticalFormat(source: string, filePath: string) {
    let formatted = source;
    for (let pass = 0; pass < 10_000; pass += 1) {
        const next = expandOneStructure(formatted, filePath);
        if (!next) return formatted;
        formatted = next;
    }
    throw new Error(`Vertical formatting did not converge for ${filePath}`);
}

function runOxfmt(source: string, filePath: string) {
    const result = Bun.spawnSync([oxfmt, `--stdin-filepath=${filePath}`], {
        cwd: root,
        stdin: new Blob([source]),
        stdout: 'pipe',
        stderr: 'pipe',
    });
    if (result.exitCode !== 0) {
        throw new Error(new TextDecoder().decode(result.stderr));
    }
    return new TextDecoder().decode(result.stdout);
}

const glob = new Bun.Glob('**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}');
const paths: string[] = [];
for await (const path of glob.scan({ cwd: root, onlyFiles: true })) {
    if (
        path.split('/').some((segment) => ignoredDirectories.has(segment)) ||
        !sourceExtensions.has(path.slice(path.lastIndexOf('.')))
    ) {
        continue;
    }
    paths.push(path);
}

const changed: string[] = [];
for (const path of paths) {
    const absolutePath = `${root}/${path}`;
    const original = await Bun.file(absolutePath).text();
    const oxfmtOutput = checkOnly ? runOxfmt(original, path) : original;
    const formatted = verticalFormat(oxfmtOutput, path);

    if (checkOnly) {
        if (formatted !== original) changed.push(path);
    } else if (formatted !== original) {
        await Bun.write(absolutePath, formatted);
    }
}

if (changed.length > 0) {
    process.stderr.write(
        `Files need formatting:\n${changed.map((path) => `  ${path}`).join('\n')}\n`
    );
    process.exitCode = 1;
}
