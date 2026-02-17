---
description: Never disable ESLint and always flag existing disables
alwaysApply: true
---

# Never Disable ESLint

This project should **never disable ESLint**, even for a single line.

- **Do not add** comments like:
  - `/* eslint-disable */`
  - `/* eslint-disable-next-line */`
  - `// eslint-disable-next-line`
  - `/* eslint-disable @typescript-eslint/no-explicit-any */`
  - Any other `eslint-disable` or `eslint-disable-line` variants.

- **When changing code**:
  - Prefer **fixing the underlying issue** (e.g., unused variables, implicit `any`, missing `await`) instead of disabling the rule.
  - Improve the code while still fully complying with the existing ESLint configuration.

- **When you see existing ESLint disables** in the codebase:
  - **Call them out explicitly** in your explanations.
  - Propose a concrete refactor that removes the disable while keeping behavior correct.

## Examples

```typescript
// ❌ BAD – disabling ESLint
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleMessage(msg: any) {
  console.log(msg);
}

// ✅ GOOD – fix the type instead of disabling
function handleMessage(msg: string) {
  console.log(msg);
}
```

```typescript
// ❌ BAD – unused variable with disable
// eslint-disable-next-line no-unused-vars
const data = await fetchData();

// ✅ GOOD – use or remove the variable
await fetchData(); // fire-and-forget
```
