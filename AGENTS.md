# Arc backend guidance

This repository owns Sora's server-side behavior. Keep database access, provider integrations, authentication, catalog behavior, playback resolution, and scheduling here. Client applications consume the public API repository and must not import server-only packages.

Keep code readable at the owning call site. Do not extract one-use values or helpers unless the name communicates a real rule, invariant, lifecycle, public contract, or substantial algorithm. Preserve public behavior and persisted data while changing structure.

Format every object-shaped structure with multiple members vertically. Keep the opening brace on its normal line, put each property or member on its own line, and put the closing brace on its own line. Apply this to object literals, object types, interfaces, mapped types, and nested object-shaped structures everywhere, including type expressions inside unions, intersections, generics, and function signatures. Do not put multiple properties or members on one line.

The public client seam is the API contracts and SDK in `soraorg/api`. Its contract must stay browser-safe and must not import database, provider, Bun server, or scheduler modules. The API and scheduler share core logic here, but remain separate runtimes so a stalled provider or long job cannot block request handling.

Before handoff, run:

```bash
bun run format:check
bun run lint
bun run check
```

Do not hand-edit generated output or database migrations. Do not commit unless the user asks for a commit.
