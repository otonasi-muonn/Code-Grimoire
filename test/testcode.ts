// 🧪 魔導書生成の実験コード (Test Spell)

// 1. 基本的な召喚魔法 (Function Declaration)
function summonDragon(name, mana) {
    let power = 0;
    let isRaging = false;

    // ループ魔法 (for loop) -> 魔法陣の外周リング
    for (let i = 0; i < mana; i++) {
        // 条件分岐 (if) -> トゲのような装飾
        if (i % 3 === 0) {
            power += castFireball(); // 内部呼び出し
            isRaging = true;
        } else {
            chargeMana(10);
        }
    }
    
    return { name: name, power: power };
}

// 2. 矢の魔法 (Arrow Function)
const castFireball = () => {
    let heat = 100;
    // 継続魔法 (while loop)
    while (heat > 0) {
        heat -= 10;
        if (heat < 50) break;
    }
    return 50;
};

// 3. 無名魔法 (Function Expression)
const chargeMana = function(amount) {
    let current = 0;
    if (amount > 0) {
        current += amount;
    }
    return current;
};

// 4. 深淵の魔法 (Nested Structures)
function ancientRitual() {
    let depth = 0;
    if (true) {
        if (true) {
            if (true) {
                // ネストレベル3 -> 魔法陣が立体的になるはず
                depth = 3;
                castFireball();
            }
        }
    }
}