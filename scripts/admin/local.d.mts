export type LocalSelection = { note: string; sourceRoot: string; id?: string; ffmpeg?: string; ffprobe?: string };
export type LocalResource = {
	identity: string; path: string; kind: 'image' | 'video'; action: 'reused' | 'convert' | 'deduplicated' | 'blocked';
	status: 'matched' | 'missing' | 'error'; message: string; error?: string; file?: string;
	sha256?: string; bytes?: number; recipe?: string; key?: string; intact?: boolean;
};
export type LocalInspection = {
	id: string; note: string; sourceRoot: string; sourceText: string; body: string; normalizedDraftText: string; snapshot: string;
	metadata: { owner: 'official' | 'source'; values: Record<string, unknown>; requirements: string[] };
	references: { sourceRef: string; normalizedPath: string | null; kind: 'image' | 'video'; usage: 'body' | 'gallery'; alt: string; diagnostic?: string }[];
	resources: LocalResource[];
	counts: { references: number; resources: number; galleries: number; videos: number; matched: number; missing: number };
	budget: { documentBytes: number; storeBytes: number; webFiles: number; unknownResources: number };
	warnings: string[]; errors: string[]; canPrepare: boolean;
	instructions: { sync: string; normalize: string; build: string };
	formal: { path: string; url: string; rendered: boolean; ready: boolean; errors: string[] };
};
export type LocalProgress = { completed: number; total: number; action: 'reused' | 'converted' | 'deduplicated'; kind: 'image' | 'video' };
export type LocalJobState = 'queued' | 'running' | 'succeeded' | 'failed';
export type LocalJob = {
	id: string; state: LocalJobState; revision: number; progress: LocalProgress | null; errors: string[];
	events: { revision: number; state: LocalJobState; progress: LocalProgress | null }[];
	report: LocalInspection | null; error: string | null;
	result: null | { preparation: Record<string, unknown>; inspection: LocalInspection | null };
};
export type LocalCapabilities = {
	available: boolean; devOnly: boolean; readOnlySource: boolean; canInspect: boolean; canPrepare: boolean;
	canSync: boolean; canPublish: boolean; jobTransport: 'long-poll'; policy: unknown; busy: boolean;
};
export function createAdminLocal(options?: { repoRoot?: string; waitTimeoutMs?: number }): {
	middleware: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next: () => void) => Promise<void>;
	inspect: (input: LocalSelection) => Promise<LocalInspection>;
	prepare: (input: LocalSelection) => Promise<LocalJob>;
	getJob: (id: string) => LocalJob;
	waitJob: (id: string, after: number, options?: { signal?: AbortSignal }) => Promise<LocalJob>;
};
