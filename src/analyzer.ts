// ============================================================
// Code Grimoire - TypeScript Compiler API ベースの解析エンジン
// ============================================================
import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import type {
    DependencyGraph,
    GraphNode,
    GraphEdge,
    SymbolInfo,
    NodeKind,
    EdgeKind,
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

        nodes.set(filePath, node);

        // import文を走査してエッジを生成
        collectImportEdges(sourceFile, program, filePath, normalizeFilePath, edges);
    }

    const analysisTimeMs = Math.round(performance.now() - startTime);

    return {
        nodes: Array.from(nodes.values()),
        edges,
        rootPath: workspaceRoot,
        analysisTimeMs,
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

// ─── ユーティリティ ──────────────────────────────────────

function emptyGraph(rootPath: string, startTime: number): DependencyGraph {
    return {
        nodes: [],
        edges: [],
        rootPath,
        analysisTimeMs: Math.round(performance.now() - startTime),
    };
}