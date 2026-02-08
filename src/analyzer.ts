import * as acornLoose from 'acorn-loose';

// 型定義（他のファイルでも使えるようにexport）
export interface SpellData {
    summary: { loops: number; conditions: number; variables: number; depth: number; };
    functions: any[];
    callGraph: Record<string, string[]>;
}

export function analyzeCode(code: string): SpellData | null {
    try {
        // looseモードで解析（書きかけのコードでも止まらない）
        const ast = acornLoose.parse(code, { ecmaVersion: 2020 });
        return extractSpellData(ast);
    } catch (e) {
        console.error("Parsing failed:", e);
        return null;
    }
}

// 内部ロジック: ASTから必要な情報を抽出
function extractSpellData(ast: any): SpellData {
    const summary = { loops: 0, conditions: 0, variables: 0, depth: 0 };
    const functions: any[] = [];

    // ヘルパー: 関数ノードかどうかの判定
    const isFunctionNode = (n: any) => 
        n && ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(n.type);

    // ヘルパー: 呼び出し名の取得（obj.methodのような形も考慮）
    const calleeName = (n: any): string => {
        if (!n) return 'unknown';
        if (n.type === 'Identifier') return n.name;
        if (n.type === 'MemberExpression') {
            const obj = n.object && calleeName(n.object);
            const prop = n.property && (n.property.name || (n.property.value ? String(n.property.value) : ''));
            return obj && prop ? obj + '.' + prop : (prop || obj || 'member');
        }
        if (n.type === 'CallExpression') return calleeName(n.callee);
        return 'unknown';
    };

    // 汎用ウォーカー（ASTを再帰的に探索）
    const walk = (node: any, depth: number, cb: (n: any, d: number) => void) => {
        if (!node || typeof node !== 'object') return;
        summary.depth = Math.max(summary.depth, depth);
        cb(node, depth);
        for (const key in node) {
            if (Object.prototype.hasOwnProperty.call(node, key)) {
                const child = node[key];
                if (Array.isArray(child)) {
                    child.forEach(c => walk(c, depth + 1, cb));
                } else if (child && typeof child === 'object') {
                    walk(child, depth + 1, cb);
                }
            }
        }
    };

    // 1. 全体スキャン（Summary用）
    walk(ast, 1, (n) => {
        if (['ForStatement', 'WhileStatement', 'ForOfStatement', 'ForInStatement'].includes(n.type)) summary.loops++;
        if (['IfStatement', 'ConditionalExpression'].includes(n.type)) summary.conditions++;
        if (n.type === 'VariableDeclaration') summary.variables += (n.declarations?.length || 1);
    });

    // 2. 関数ごとの詳細抽出
    const findFunctions = (root: any) => {
        walk(root, 1, (n, depth) => {
            // 変数宣言内関数(const f = () => {}) or 直接宣言関数(function f(){})
            if (isFunctionNode(n) || (n.type === 'VariableDeclarator' && n.init && isFunctionNode(n.init))) {
                let fnNode = n.type === 'VariableDeclarator' ? n.init : n;
                
                // 名前解決
                let name = 'anonymous';
                if (n.type === 'VariableDeclarator' && n.id?.name) name = n.id.name;
                else if (fnNode.id?.name) name = fnNode.id.name;

                // 行数計算
                const start = fnNode.loc?.start?.line || 0;
                const end = fnNode.loc?.end?.line || 0;
                const lineCount = (start && end) ? (end - start + 1) : 10;

                const stats: any = {
                    name,
                    lineCount,
                    variables: new Set<string>(),
                    calls: [],
                    conditions: 0,
                    loops: []
                };

                // 関数内部をスキャン
                walk(fnNode.body || fnNode, 1, (m) => {
                    if (m.type === 'VariableDeclarator' && m.id?.name) stats.variables.add(m.id.name);
                    if (m.type === 'CallExpression') stats.calls.push({ name: calleeName(m.callee) });
                    if (['IfStatement', 'ConditionalExpression'].includes(m.type)) stats.conditions++;
                    if (['ForStatement', 'WhileStatement'].includes(m.type)) stats.loops.push({ type: m.type });
                });

                // Setを配列に戻す
                stats.variables = Array.from(stats.variables);
                functions.push(stats);
            }
        });
    };

    findFunctions(ast);

    // コールグラフ作成（誰が誰を呼んでいるか）
    const callGraph: Record<string, string[]> = {};
    functions.forEach(f => {
        callGraph[f.name] = f.calls.map((c: any) => c.name);
    });

    return { summary, functions, callGraph };
}