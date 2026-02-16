// ============================================================
// Code Grimoire - TypeScript Compiler API ベースの解析エンジン
// ============================================================
import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import type {
    DependencyGraph,
    GraphNode,
    GraphEdge,
    SymbolInfo,
    NodeKind,
    EdgeKind,
    SecurityWarning,
    FunctionDep,
    CircularDependency,
    GitHotspot,
} from './shared/types.js';

// ─── Public API ─────────────────────────────────────────

/**
 * ワークスペースルートから tsconfig.json を自動検出し、
 * TS Compiler API でファイル依存グラフを解析する。
 */
export function analyzeWorkspace(workspaceRoot: string): DependencyGraph {
    const startTime = performance.now();

    // 1. tsconfig.json の自動検出
    const tsconfigPath = findTsConfig(workspaceRoot);
    if (!tsconfigPath) {
        // tsconfig が無い場合は workspaceRoot 配下の .ts ファイルを直接解析
        return analyzeFiles(workspaceRoot, getSourceFiles(workspaceRoot), startTime);
    }

    // 2. tsconfig.json を読み込んでプログラム生成
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (configFile.error) {
        console.error('tsconfig read error:', ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
        return emptyGraph(workspaceRoot, startTime);
    }

    // Project References パターン対応:
    // "files": [] + "references": [...] の場合、子 tsconfig を結合して解析する
    const config = configFile.config;
    const hasEmptyFiles = Array.isArray(config.files) && config.files.length === 0;
    const hasReferences = Array.isArray(config.references) && config.references.length > 0;
    const hasNoInclude = !config.include;

    if (hasEmptyFiles && hasReferences && hasNoInclude) {
        return analyzeProjectReferences(tsconfigPath, config.references, workspaceRoot, startTime);
    }

    const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(tsconfigPath)
    );

    const program = ts.createProgram({
        rootNames: parsedConfig.fileNames,
        options: parsedConfig.options,
    });

    // 3. グラフの構築
    return buildGraph(program, workspaceRoot, startTime);
}

// ─── Project References パターン対応 ────────────────────

function analyzeProjectReferences(
    tsconfigPath: string,
    references: Array<{ path: string }>,
    workspaceRoot: string,
    startTime: number
): DependencyGraph {
    const tsconfigDir = path.dirname(tsconfigPath);
    const allFileNames: string[] = [];
    let mergedOptions: ts.CompilerOptions = {};

    for (const ref of references) {
        const refPath = path.resolve(tsconfigDir, ref.path);
        const refConfigPath = fs.statSync(refPath).isDirectory()
            ? path.join(refPath, 'tsconfig.json')
            : refPath;

        if (!fs.existsSync(refConfigPath)) { continue; }

        const refConfigFile = ts.readConfigFile(refConfigPath, ts.sys.readFile);
        if (refConfigFile.error) { continue; }

        const parsed = ts.parseJsonConfigFileContent(
            refConfigFile.config,
            ts.sys,
            path.dirname(refConfigPath)
        );

        allFileNames.push(...parsed.fileNames);
        // 最初に見つかった参照の options をベースにする
        if (Object.keys(mergedOptions).length === 0) {
            mergedOptions = parsed.options;
        }
    }

    if (allFileNames.length === 0) {
        // 子 tsconfig にもファイルがない場合はフォールバック
        return analyzeFiles(workspaceRoot, getSourceFiles(workspaceRoot), startTime);
    }

    // 重複除去
    const uniqueFileNames = [...new Set(allFileNames)];

    const program = ts.createProgram({
        rootNames: uniqueFileNames,
        options: mergedOptions,
    });

    return buildGraph(program, workspaceRoot, startTime);
}

// ─── tsconfig 自動検出 ──────────────────────────────────

function findTsConfig(root: string): string | undefined {
    const candidate = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
    return candidate;
}

// ─── tsconfig が無い場合のフォールバック ─────────────────

function getSourceFiles(root: string): string[] {
    const files: string[] = [];
    const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'out') {
                    continue;
                }
                walk(full);
            } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
                files.push(full);
            }
        }
    };
    walk(root);
    return files;
}

function analyzeFiles(root: string, files: string[], startTime: number): DependencyGraph {
    const program = ts.createProgram({
        rootNames: files,
        options: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.Node16,
            allowJs: true,
        },
    });
    return buildGraph(program, root, startTime);
}

// ─── グラフ構築のコアロジック ────────────────────────────

function buildGraph(program: ts.Program, workspaceRoot: string, startTime: number): DependencyGraph {
    const checker = program.getTypeChecker();
    const nodes: Map<string, GraphNode> = new Map();
    const edges: GraphEdge[] = [];

    const normalizeFilePath = (filePath: string): string => {
        return path.normalize(filePath).replace(/\\/g, '/');
    };

    const getRelativePath = (filePath: string): string => {
        return path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
    };

    const getNodeKind = (sourceFile: ts.SourceFile): NodeKind => {
        const fileName = sourceFile.fileName;
        if (fileName.endsWith('.d.ts')) { return 'declaration'; }
        if (fileName.includes('node_modules')) { return 'external'; }
        return 'source';
    };

    // ソースファイルを走査してノードを登録
    for (const sourceFile of program.getSourceFiles()) {
        const filePath = normalizeFilePath(sourceFile.fileName);

        // node_modules は除外（外部参照先としてのみ記録）
        if (filePath.includes('node_modules')) { continue; }

        const lineCount = sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line + 1;

        // エクスポートされたシンボルを収集
        const exports = collectExports(sourceFile, checker);

        const node: GraphNode = {
            id: filePath,
            label: path.basename(sourceFile.fileName),
            filePath,
            relativePath: getRelativePath(sourceFile.fileName),
            kind: getNodeKind(sourceFile),
            exports,
            lineCount,
        };

        // import文を走査してエッジを生成
        collectImportEdges(sourceFile, program, filePath, normalizeFilePath, edges);

        // Phase 3: ディレクトリグループ割り当て
        const relPath = getRelativePath(sourceFile.fileName);
        const parts = relPath.split('/');
        node.directoryGroup = parts.length > 1 ? parts[parts.length - 2] : '(root)';

        // Phase 3: セキュリティ警告検出
        node.securityWarnings = collectSecurityWarnings(sourceFile);

        // Phase 3: 関数レベル依存 (CallExpression 追跡)
        node.functionDeps = collectFunctionDeps(sourceFile, program, filePath, normalizeFilePath);

        nodes.set(filePath, node);
    }

    // Phase 3: 循環参照検出
    const circularDeps = detectCircularDependencies(nodes, edges);

    // 循環参照フラグをノードに付与
    const cycleNodeIds = new Set<string>();
    for (const cycle of circularDeps) {
        for (const id of cycle.path) { cycleNodeIds.add(id); }
    }
    for (const node of nodes.values()) {
        node.inCycle = cycleNodeIds.has(node.id);
    }

    // Phase 3: Git Hotspot 統合
    const gitHotspots = applyGitHotspots(nodes, workspaceRoot);

    const analysisTimeMs = Math.round(performance.now() - startTime);

    return {
        nodes: Array.from(nodes.values()),
        edges,
        rootPath: workspaceRoot,
        analysisTimeMs,
        circularDeps,
        gitHotspots,
    };
}

// ─── エクスポートシンボルの収集 ──────────────────────────

function collectExports(sourceFile: ts.SourceFile, checker: ts.TypeChecker): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);

    if (!moduleSymbol) { return symbols; }

    const exportedSymbols = checker.getExportsOfModule(moduleSymbol);

    for (const sym of exportedSymbols) {
        const decl = sym.declarations?.[0];
        if (!decl) { continue; }

        const line = sourceFile.getLineAndCharacterOfPosition(decl.getStart()).line + 1;
        const isDefault = sym.getName() === 'default';

        let kind: SymbolInfo['kind'] = 'other';
        if (ts.isFunctionDeclaration(decl) || ts.isFunctionExpression(decl) || ts.isArrowFunction(decl) || ts.isMethodDeclaration(decl)) {
            kind = 'function';
        } else if (ts.isClassDeclaration(decl)) {
            kind = 'class';
        } else if (ts.isVariableDeclaration(decl)) {
            kind = 'variable';
        } else if (ts.isTypeAliasDeclaration(decl)) {
            kind = 'type';
        } else if (ts.isInterfaceDeclaration(decl)) {
            kind = 'interface';
        } else if (ts.isEnumDeclaration(decl)) {
            kind = 'enum';
        }

        symbols.push({
            name: sym.getName(),
            kind,
            line,
            isDefault,
        });
    }

    return symbols;
}

// ─── import エッジの収集 ──────────────────────────────────

function collectImportEdges(
    sourceFile: ts.SourceFile,
    program: ts.Program,
    sourceId: string,
    normalize: (p: string) => string,
    edges: GraphEdge[]
): void {
    const visit = (node: ts.Node) => {
        // --- static import ---
        if (ts.isImportDeclaration(node)) {
            const moduleSpec = node.moduleSpecifier;
            if (ts.isStringLiteral(moduleSpec)) {
                const resolved = resolveModulePath(moduleSpec.text, sourceFile.fileName, program);
                if (resolved) {
                    const targetId = normalize(resolved);
                    const importedSymbols = getImportedSymbolNames(node);
                    const kind = getImportEdgeKind(node);
                    edges.push({ source: sourceId, target: targetId, importedSymbols, kind });
                }
            }
        }

        // --- re-export: export { x } from '...' ---
        if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            const resolved = resolveModulePath(node.moduleSpecifier.text, sourceFile.fileName, program);
            if (resolved) {
                const targetId = normalize(resolved);
                const importedSymbols = getReExportedSymbolNames(node);
                edges.push({ source: sourceId, target: targetId, importedSymbols, kind: 're-export' });
            }
        }

        // --- dynamic import: import('...') ---
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            const arg = node.arguments[0];
            if (arg && ts.isStringLiteral(arg)) {
                const resolved = resolveModulePath(arg.text, sourceFile.fileName, program);
                if (resolved) {
                    const targetId = normalize(resolved);
                    edges.push({ source: sourceId, target: targetId, importedSymbols: [], kind: 'dynamic-import' });
                }
            }
        }

        ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
}

// ─── ヘルパー関数群 ─────────────────────────────────────

function resolveModulePath(
    moduleName: string,
    containingFile: string,
    program: ts.Program
): string | undefined {
    const compilerOptions = program.getCompilerOptions();
    const result = ts.resolveModuleName(moduleName, containingFile, compilerOptions, ts.sys);
    return result.resolvedModule?.resolvedFileName;
}

function getImportedSymbolNames(node: ts.ImportDeclaration): string[] {
    const symbols: string[] = [];
    const clause = node.importClause;
    if (!clause) { return symbols; } // side-effect import

    // default import
    if (clause.name) {
        symbols.push(clause.name.text);
    }

    // named imports
    const bindings = clause.namedBindings;
    if (bindings) {
        if (ts.isNamedImports(bindings)) {
            for (const spec of bindings.elements) {
                symbols.push(spec.name.text);
            }
        } else if (ts.isNamespaceImport(bindings)) {
            symbols.push('* as ' + bindings.name.text);
        }
    }

    return symbols;
}

function getReExportedSymbolNames(node: ts.ExportDeclaration): string[] {
    const symbols: string[] = [];
    if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const spec of node.exportClause.elements) {
            symbols.push(spec.name.text);
        }
    }
    return symbols;
}

function getImportEdgeKind(node: ts.ImportDeclaration): EdgeKind {
    if (node.importClause?.isTypeOnly) {
        return 'type-import';
    }
    if (!node.importClause) {
        return 'side-effect';
    }
    return 'static-import';
}

// ─── Phase 3: セキュリティ警告検出 ──────────────────────

/** 危険なパターンを検出する */
const DANGEROUS_FUNCTIONS: Record<string, SecurityWarning['kind']> = {
    'eval': 'eval-usage',
    'Function': 'eval-usage',
    'dangerouslySetInnerHTML': 'innerHTML',
    'innerHTML': 'innerHTML',
    'outerHTML': 'innerHTML',
    'document.write': 'dangerous-function',
    'document.writeln': 'dangerous-function',
};

/** Taint ソースとなる API 名 */
const TAINT_SOURCES = new Set([
    'req.body', 'req.query', 'req.params', 'req.headers',
    'location.search', 'location.hash', 'location.href',
    'document.cookie', 'localStorage', 'sessionStorage',
    'window.name', 'postMessage',
    'URLSearchParams', 'FormData',
]);

function collectSecurityWarnings(sourceFile: ts.SourceFile): SecurityWarning[] {
    const warnings: SecurityWarning[] = [];

    const visit = (node: ts.Node) => {
        // CallExpression: eval(...), Function(...) 等
        if (ts.isCallExpression(node)) {
            const callText = node.expression.getText(sourceFile);
            for (const [pattern, kind] of Object.entries(DANGEROUS_FUNCTIONS)) {
                if (callText === pattern || callText.endsWith('.' + pattern)) {
                    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
                    warnings.push({ kind, line, message: `Dangerous: ${pattern}()`, symbol: pattern });
                }
            }

            // Taint source 検出
            for (const taint of TAINT_SOURCES) {
                if (callText.includes(taint) || node.getText(sourceFile).includes(taint)) {
                    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
                    warnings.push({
                        kind: 'taint-source',
                        line,
                        message: `Taint source: ${taint}`,
                        symbol: taint,
                    });
                    break; // 1つの CallExpression に対して1つのみ
                }
            }
        }

        // PropertyAccessExpression: .innerHTML = ..., .dangerouslySetInnerHTML
        if (ts.isPropertyAccessExpression(node)) {
            const propName = node.name.text;
            if (propName === 'innerHTML' || propName === 'outerHTML') {
                // 代入のコンテキストにあるかチェック
                if (node.parent && ts.isBinaryExpression(node.parent) &&
                    node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
                    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
                    warnings.push({
                        kind: 'innerHTML',
                        line,
                        message: `Direct ${propName} assignment`,
                        symbol: propName,
                    });
                }
            }
        }

        // JSX: dangerouslySetInnerHTML
        if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === 'dangerouslySetInnerHTML') {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
            warnings.push({
                kind: 'innerHTML',
                line,
                message: 'React dangerouslySetInnerHTML',
                symbol: 'dangerouslySetInnerHTML',
            });
        }

        ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return warnings;
}

// ─── Phase 3: 関数レベル依存 (CallExpression 追跡) ─────

function collectFunctionDeps(
    sourceFile: ts.SourceFile,
    program: ts.Program,
    sourceId: string,
    normalize: (p: string) => string,
): FunctionDep[] {
    const deps: FunctionDep[] = [];
    const checker = program.getTypeChecker();

    /** 最も近い外側の関数/メソッド名を取得 */
    function getEnclosingFunctionName(node: ts.Node): string {
        let current = node.parent;
        while (current) {
            if (ts.isFunctionDeclaration(current) && current.name) {
                return current.name.text;
            }
            if (ts.isMethodDeclaration(current) && ts.isIdentifier(current.name)) {
                return current.name.text;
            }
            if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
                // 変数宣言の名前を取得
                if (current.parent && ts.isVariableDeclaration(current.parent) && ts.isIdentifier(current.parent.name)) {
                    return current.parent.name.text;
                }
                // プロパティ代入の名前
                if (current.parent && ts.isPropertyAssignment(current.parent) && ts.isIdentifier(current.parent.name)) {
                    return current.parent.name.text;
                }
                return '(anonymous)';
            }
            current = current.parent;
        }
        return '(module)';
    }

    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
            let calleeName: string | undefined;
            let targetFileId: string | undefined;

            const expr = node.expression;

            // 直接呼び出し: myFunc()
            if (ts.isIdentifier(expr)) {
                calleeName = expr.text;

                // シンボルを解決してファイルを特定
                try {
                    const symbol = checker.getSymbolAtLocation(expr);
                    const decl = symbol?.declarations?.[0];
                    if (decl) {
                        const declFile = decl.getSourceFile().fileName;
                        const normalizedDecl = normalize(declFile);
                        if (normalizedDecl !== sourceId && !declFile.includes('node_modules')) {
                            targetFileId = normalizedDecl;
                        }
                    }
                } catch { /* 解決失敗は無視 */ }
            }

            // メソッド呼び出し: obj.method()
            if (ts.isPropertyAccessExpression(expr)) {
                calleeName = expr.name.text;
            }

            if (calleeName) {
                const callerName = getEnclosingFunctionName(node);
                const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
                deps.push({ callerName, calleeName, targetFileId, line });
            }
        }

        ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return deps;
}

// ─── Phase 3: 循環参照検出 (Tarjan's SCC) ──────────────

function detectCircularDependencies(
    nodes: Map<string, GraphNode>,
    edges: GraphEdge[]
): CircularDependency[] {
    // 隣接リスト構築
    const adj = new Map<string, string[]>();
    for (const node of nodes.keys()) {
        adj.set(node, []);
    }
    for (const edge of edges) {
        if (adj.has(edge.source) && nodes.has(edge.target)) {
            adj.get(edge.source)!.push(edge.target);
        }
    }

    // Tarjan's SCC
    let index = 0;
    const stack: string[] = [];
    const onStack = new Set<string>();
    const indices = new Map<string, number>();
    const lowlinks = new Map<string, number>();
    const sccs: string[][] = [];

    function strongConnect(v: string) {
        indices.set(v, index);
        lowlinks.set(v, index);
        index++;
        stack.push(v);
        onStack.add(v);

        for (const w of adj.get(v) || []) {
            if (!indices.has(w)) {
                strongConnect(w);
                lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
            } else if (onStack.has(w)) {
                lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
            }
        }

        // SCC のルート
        if (lowlinks.get(v) === indices.get(v)) {
            const scc: string[] = [];
            let w: string;
            do {
                w = stack.pop()!;
                onStack.delete(w);
                scc.push(w);
            } while (w !== v);

            // サイズ2以上のSCCのみ（= 実際の循環参照）
            if (scc.length >= 2) {
                sccs.push(scc);
            }
        }
    }

    for (const v of nodes.keys()) {
        if (!indices.has(v)) {
            strongConnect(v);
        }
    }

    return sccs.map(path => ({ path }));
}

// ─── Phase 3: Git Hotspot ────────────────────────────────

function collectGitHotspots(workspaceRoot: string): Map<string, GitHotspot> {
    const hotspots = new Map<string, GitHotspot>();

    try {
        // git が使えるか & .git ディレクトリがあるか
        if (!fs.existsSync(path.join(workspaceRoot, '.git'))) {
            return hotspots;
        }

        // ファイルごとの commit 数を取得
        // git log --format="%H" --name-only で commit hash + ファイル名を取得
        const result = execSync(
            'git log --format="---COMMIT---%aI" --name-only --diff-filter=ACDMR --no-renames -- "*.ts" "*.tsx" "*.js" "*.jsx"',
            { cwd: workspaceRoot, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 15000 }
        );

        let currentDate = '';
        const fileDateMap = new Map<string, { count: number; lastDate: string }>();

        for (const line of result.split('\n')) {
            if (line.startsWith('---COMMIT---')) {
                currentDate = line.replace('---COMMIT---', '').trim();
                continue;
            }
            const trimmed = line.trim();
            if (!trimmed || trimmed.length === 0) { continue; }

            // 相対パスを正規化
            const relPath = trimmed.replace(/\\/g, '/');
            const existing = fileDateMap.get(relPath);
            if (existing) {
                existing.count++;
                // 最新の日付を保持
                if (currentDate > existing.lastDate) {
                    existing.lastDate = currentDate;
                }
            } else {
                fileDateMap.set(relPath, { count: 1, lastDate: currentDate });
            }
        }

        for (const [relPath, data] of fileDateMap) {
            hotspots.set(relPath, {
                relativePath: relPath,
                commitCount: data.count,
                lastModified: data.lastDate,
            });
        }
    } catch (err) {
        console.warn('[Code Grimoire] Git hotspot collection failed:', err);
    }

    return hotspots;
}

/** Git Hotspot をグラフノードに適用 */
function applyGitHotspots(
    nodes: Map<string, GraphNode>,
    workspaceRoot: string
): GitHotspot[] {
    const hotspots = collectGitHotspots(workspaceRoot);

    for (const node of nodes.values()) {
        const hotspot = hotspots.get(node.relativePath);
        if (hotspot) {
            node.gitCommitCount = hotspot.commitCount;
            node.gitLastModified = hotspot.lastModified;
        }
    }

    return Array.from(hotspots.values());
}

// ─── ユーティリティ ──────────────────────────────────────

function emptyGraph(rootPath: string, startTime: number): DependencyGraph {
    return {
        nodes: [],
        edges: [],
        rootPath,
        analysisTimeMs: Math.round(performance.now() - startTime),
    };
}