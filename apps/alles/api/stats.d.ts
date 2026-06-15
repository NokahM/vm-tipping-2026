import type { IncomingMessage, ServerResponse } from 'http';

/** Serverless-handler for /api/stats (gjenbrukes av Vite dev-proxyen). */
declare function handler(req: IncomingMessage, res: ServerResponse): Promise<void>;
export default handler;
