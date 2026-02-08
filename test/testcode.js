"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const analyzeNumbers = (numbers) => {
    let evenCount = 0;
    let oddCount = 0;
    // 2. ループ処理 (for...of 文)
    for (const num of numbers) {
        // 3. 条件分岐 (if...else 文)
        if (num % 2 === 0) {
            evenCount++;
        }
        else {
            oddCount++;
        }
    }
    return { even: evenCount, odd: oddCount };
};
// 実行例
const data = [10, 21, 32, 43, 54, 65];
const result = analyzeNumbers(data);
console.log(`偶数の数: ${result.even}`); // 3
console.log(`奇数の数: ${result.od}`); // 3
//# sourceMappingURL=testcode.js.map