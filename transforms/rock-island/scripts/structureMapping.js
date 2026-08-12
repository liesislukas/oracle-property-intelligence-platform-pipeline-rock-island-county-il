/**
 * Rock Island County — structure mapping.
 *
 * `@elephant-xyz/cli@1.58.1` requires all four mapping modules to exist and exit 0
 * (dist/commands/transform/script-runner.js lines 110-136: a missing one throws
 * "Required script not found"). The county GIS parcel layer carries no per-structure detail —
 * it publishes one row per parcel, not per building, room or service connection.
 *
 * This module therefore writes nothing and exits 0. Inventing a structure record to fill the
 * slot would be fabrication; an absent entity is the honest outcome.
 */
