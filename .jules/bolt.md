## 2024-05-22 - Regex Optimization in Loop
**Learning:** Creating `new RegExp` objects inside a loop significantly impacts performance, especially when called repeatedly. Hoisting the RegExp creation out of the loop reduced execution time by ~14x in a benchmark with 10k lines.
**Action:** When using regex in loops, always check if the pattern can be pre-compiled or hoisted. Be careful with `lastIndex` when reusing global regexes.
