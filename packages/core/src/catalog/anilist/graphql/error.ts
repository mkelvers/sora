/** A GraphQL transport or response failure, including upstream retry guidance when available. */
export class GraphQLRequestError extends Error {
    /** HTTP or GraphQL status associated with the failure, when the upstream supplied one. */
    readonly status?: number;
    /** Delay requested by the upstream before retrying, in milliseconds. */
    readonly retryAfterMs?: number;

    constructor({
        message,
        cause,
        status,
        retryAfterMs,
    }: {
        readonly message: string;
        readonly cause?: unknown;
        readonly status?: number;
        readonly retryAfterMs?: number;
    }) {
        super(message, { cause });
        this.name = 'GraphQLRequestError';
        this.status = status;
        this.retryAfterMs = retryAfterMs;
    }
}
