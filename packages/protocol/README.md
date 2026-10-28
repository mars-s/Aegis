# Protocol

Storage, HTTP, SSE and sandbox boundaries over domain. This package may import domain and Zod. It owns legacy board and library codecs, actual host response/event shapes, SSE framing, widget document builders and theme rewriting. It has no Node, React or Effect imports. Node networking for link previews lives in agent/link-preview.ts; the pure metadata parser lives in domain.

Public leaves are `/storage`, `/http`, `/events`, `/sandbox` and `/html-theme`. Decode functions return parsed values and throw on malformed input. decodeStoredBoard handles complete current boards; decodeLegacyStoredBoard retains older omitted presentation fields. Storage codecs preserve record insertion order, omitted fields, camera z up to the host's existing limit and extra JSON metadata. They do not rename disk or wire fields.

HTTP exports decodeBoardList, decodeBatchResponse, decodeHostEvent, decodeHostError and decodeOkResponse, with inferred response/event types. Batch failures retain index/reason/hint. Board events retain baseRev/rev, exact patches and nullable field deletion values. Agent status metadata remains intact. Unknown event kinds are refused. EventDecoder handles partial chunks, CRLF and comment pings.

Build domain first, then run `npm run build --workspace @aegis/protocol`. Domain unit checks include direct codec, SSE, schema-export and safe-type checks.
