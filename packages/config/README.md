# @booking/config

Shared tooling presets, used only where adopting them is a pure refactor.

| Preset               | Used by                                     | How                                                     |
| -------------------- | ------------------------------------------- | ------------------------------------------------------- |
| `prettier.json`      | repo root (`.prettierrc.json` points at it) | `"@booking/config/prettier"`                            |
| `tsconfig.node.json` | `apps/api`                                  | `"extends": "../../packages/config/tsconfig.node.json"` |
| `eslint.base.js`     | `apps/mobile`                               | `import { baseConfig } from '@booking/config/eslint'`   |

`apps/mobile` and `packages/ui` extend `expo/tsconfig.base` and keep doing so.
Edit the presets here, never a copy.
