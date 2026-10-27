# Domain

Browser-neutral board models and pure operations. Zod is the only runtime dependency. This package owns the complete built-in card catalogue, 18 object schemas, exact field errors, atomic commands, datasets, document and Markdown models, slides, collections, chart bindings and summaries. Host and frontend callers use the same built ESM. No DOM, Node, React or Effect imports belong here.

Import `@aegis/domain` or a public leaf such as `/schema`, `/commands`, `/objects`, `/dataset`, `/chart-source`, `/charts`, `/content` or `/summary`. Board and Card keep the production flat fields and legacy wire names. Command uses `op`. Schema-derived IDs are branded. CardContent is a typed payload projection that excludes geometry. LegacyCard and LegacyBoard retain omitted presentation fields from earlier files. The typed applyBatch overload accepts a complete Board and Command array; its legacy overload preserves older inputs and exact failure results.

Object checks read the Zod definitions for the legacy coercions and first-error ordering. Cross-field rules preserve existing messages. Agent schemas export with unrepresentable set to throw. Storage and network decoders live in protocol. Catalogue entries and size arrays are frozen. Runtime card registration was replaced by the complete closed catalogue.

Build with `npm run build --workspace @aegis/domain`. Verify with `npm exec tsc -- -p checks/unit/domain/tsconfig.json` and `npm exec vitest -- run checks/unit/domain`. Differential tests load the original JS from git revision 5dadce5 in a temporary directory.
