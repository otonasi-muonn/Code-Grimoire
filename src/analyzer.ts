import * as acornLoose from 'acorn-loose';

export interface SpellData {
    functions: any[];
    callGraph: Record<string, string[]>;
}

export function analyzeCode(code: string, filePath?: string): SpellData | null {
    try {
        // locations: true で行番号や文字位置を正確に取得
        const ast = acornLoose.parse(code, { ecmaVersion: 2020, locations: true });
        return extractSpellData(ast, code, filePath);
    } catch (e) {
        console.error("Parsing failed:", e);
        return null;
    }
}

function extractSpellData(ast: any, sourceCode: string, filePath?: string): SpellData {
    const functions: any[] = [];

    // ソースコードから生のテキスト（条件式など）を切り出す魔法
    const getSourceText = (node: any) => {
        if (node.start !== undefined && node.end !== undefined) {
            return sourceCode.substring(node.start, node.end);
        }
        return "???";
    };

    // 変数の初期値から型を推測
    const inferType = (initNode: any) => {
        if (!initNode) return 'unknown';
        if (initNode.type === 'Literal') {
            if (typeof initNode.value === 'number') return 'number';
            if (typeof initNode.value === 'string') return 'string';
            if (typeof initNode.value === 'boolean') return 'boolean';
        }
        return 'expression';
    };

    // ネスト構造（IF/Loop）を再帰的に解析する
    const buildLogicTree = (startNode: any) => {
        const tree: any[] = [];
        
        const scan = (nodes: any[]) => {
            if(!Array.isArray(nodes)) nodes = [nodes];
            nodes.forEach(node => {
                if(!node) return;
                if (node.type === 'IfStatement') {
                    // ここで条件式（i % 3 === 0 など）をテキストとして取得
                    const testText = getSourceText(node.test); 
                    const childLogic = buildLogicTree(node.consequent);
                    if (node.alternate) childLogic.push(...buildLogicTree(node.alternate));
                    
                    tree.push({ type: 'if', condition: testText, children: childLogic });
                } 
                else if (['ForStatement', 'WhileStatement'].includes(node.type)) {
                    tree.push({ type: 'loop', children: buildLogicTree(node.body) });
                }
                else if (node.type === 'BlockStatement') {
                    tree.push(...buildLogicTree(node.body));
                }
            });
        };

        if (startNode.body) scan(startNode.body);
        else if (Array.isArray(startNode)) scan(startNode);
        return tree;
    };

    // ウォーカー関数
    const walk = (node: any, cb: (n: any) => void) => {
        if (!node || typeof node !== 'object') return;
        cb(node);
        for (const key in node) {
            if (Object.prototype.hasOwnProperty.call(node, key)) {
                const child = node[key];
                if (Array.isArray(child)) child.forEach(c => walk(c, cb));
                else if (child && typeof child === 'object') walk(child, cb);
            }
        }
    };

    // 条件分岐やループの数をざっくりカウント
    const countConditions = (node: any) => {
        let count = 0;
        walk(node, (n) => {
            if (!n || typeof n !== 'object') return;
            if (['IfStatement', 'ConditionalExpression'].includes(n.type)) count++;
            if (['ForStatement', 'WhileStatement', 'DoWhileStatement', 'ForInStatement', 'ForOfStatement', 'SwitchStatement'].includes(n.type)) count++;
            if (n.type === 'LogicalExpression' && ['&&', '||'].includes(n.operator)) count++;
        });
        return count;
    };

    // 関数抽出メインロジック
    const findFunctions = (root: any) => {
        walk(root, (n) => {
            const isFunc = n && ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(n.type);
            const isVarFunc = n.type === 'VariableDeclarator' && n.init && ['FunctionExpression', 'ArrowFunctionExpression'].includes(n.init.type);
            
            if (isFunc || isVarFunc) {
                let fnNode = isVarFunc ? n.init : n;
                
                // 名前解決
                let name = 'anonymous';
                if (isVarFunc && n.id?.name) name = n.id.name;
                else if (fnNode.id?.name) name = fnNode.id.name;

                const start = fnNode.loc?.start?.line || 0;
                const end = fnNode.loc?.end?.line || 0;
                
                const stats: any = {
                    name,
                    lineCount: (start && end) ? (end - start + 1) : 10,
                    variables: [],
                    calls: [],
                    logicTree: buildLogicTree(fnNode.body || fnNode), // ロジックツリー生成
                    fileName: filePath || 'unknown',
                    startLine: start,
                    endLine: end,
                    conditions: 0
                };

                stats.conditions = countConditions(fnNode.body || fnNode);

                // 内部スキャン
                walk(fnNode.body || fnNode, (m) => {
                    // 変数定義
                    if (m.type === 'VariableDeclarator' && m.id?.name) {
                        stats.variables.push({
                            name: m.id.name,
                            type: inferType(m.init)
                        });
                    }
                    // 呼び出し
                    if (m.type === 'CallExpression') {
                         // 簡易的な呼び出し名取得
                        let cName = 'unknown';
                        if(m.callee.type === 'Identifier') cName = m.callee.name;
                        else if(m.callee.property?.name) cName = m.callee.property.name;
                        stats.calls.push({ name: cName });
                    }
                });
                functions.push(stats);
            }
        });
    };

    findFunctions(ast);

    const callGraph: Record<string, string[]> = {};
    functions.forEach(f => {
        callGraph[f.name] = f.calls.map((c: any) => c.name);
    });

    return { functions, callGraph };
}