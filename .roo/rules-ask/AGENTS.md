# AGENTS.md

This file provides guidance to agents when working with code in this repository.

- The canonical architecture summary already exists in [`.github/copilot-instructions.md`](../../../.github/copilot-instructions.md); prefer summarizing from there plus code rather than restating Angular basics.
- `src/test/` exists as a directory entry but currently has no files; most real test intent lives beside source in `*.spec.ts` files under [`src/app`](../../../src/app/).
- Although this is an Angular app, the test runtime is Vitest through Angular's builder, so command advice should use [`ng test`](../../../package.json:9) semantics rather than standalone [`vitest`](../../../package.json:44) CLI guidance.
- Routing explanations should mention the unusual canonical `#/List/:id` shape and automatic redirect from lowercase [`/list/:id`](../../../src/app/app.config.ts:42).
