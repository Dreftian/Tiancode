// Intentional placeholder: durable event-sourcing projectors are not
// implemented yet (see src/sync/README.md). The side-effect import chain
// server.ts -> init-projectors.ts reserves the wiring point so projectors can
// be registered here when syncing lands.
export function initProjectors() {}
