/**
 * The background scheduler: follows airing anime and stores each new episode
 * once a provider carries it. Built on graphile-worker, in the same database.
 *
 * @packageDocumentation
 */
export { startScheduler } from "./worker";
