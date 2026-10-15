export interface WorkspaceMetadata {
	title: string;
	description: string;
	completion_date: string;
	topicPath: string[];
	tags?: unknown;
	start_date?: unknown;
	end_date?: unknown;
}

export interface WorkspaceArticle extends WorkspaceMetadata {
	id: string;
	revision: number;
	sourcePath: string | null;
	targetPath: string;
	targetFileName: string;
	mediaId: string;
	topic: string;
	body: string;
	sourceMissing: boolean;
	status: 'uncommitted' | 'committed' | 'pushed';
	preparation: {
		state: 'unchecked' | 'queued' | 'running' | 'ready' | 'blocked' | 'failed' | 'cancelled';
		errors: string[];
		warnings: string[];
		progress?: Record<string, unknown>;
	};
}

export interface WorkspaceJob {
	id: string;
	state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
	articleIds: string[];
	progress: Record<string, unknown>;
	errors: string[];
	createdAt?: string;
	finishedAt?: string;
	reason?: 'import' | 'metadata' | 'source' | 'manual' | 'binding' | 'publication';
	revisions?: Record<string, number>;
	superseded?: boolean;
	results?: {
		articleId: string;
		title: string;
		revision: number;
		state: 'ready' | 'blocked' | 'failed' | 'cancelled' | 'superseded';
		message?: string;
	}[];
}

export interface WorkspaceState {
	configured: boolean;
	configuration: {
		repoRoot: string;
		sourceRoot: string;
		siteUrl: string;
		authorName?: string;
		authorEmail?: string;
	};
	articles: WorkspaceArticle[];
	topics: WorkspaceTopics;
	pending: { path: string; relativePath: string; topicPath: string[] }[];
	jobs: WorkspaceJob[];
	tools: { git: boolean; ffmpeg: boolean; ffprobe: boolean };
	publication: { state: string; sha?: string; url?: string; message?: string };
}

export interface WorkspaceTopics {
	readonly revision: number;
	readonly entries: readonly { readonly path: readonly string[]; readonly description: string }[];
	readonly pinnedPath: readonly string[] | null;
	readonly dirtyPaths: readonly (readonly string[])[];
	readonly conflict: boolean;
}

export interface WorkspaceScan {
	root: string;
	entries: {
		path: string;
		relativePath: string;
		type: 'directory' | 'markdown';
		topicPath: string[];
		included: boolean;
	}[];
}

export interface WorkspaceBindingCandidates {
	readonly candidates: readonly { readonly path: string; readonly relativePath: string }[];
}

export interface WorkspaceChanges {
	token: string;
	head: string;
	ids: string[];
	topics: readonly (readonly string[])[];
	topicRevision: number;
	files: { path: string; kind: string; before: string | null; after: string }[];
}

export interface WorkspacePublication {
	token: string;
	head: string;
	branch: string;
	remote: string;
	ahead: { sha: string; message: string; paths: string[] }[];
	uncommittedCount: number;
	errors: string[];
}

export interface DesktopBridge {
	chooseDirectory(): Promise<string | null>;
	chooseMarkdown(articleId?: string): Promise<string | null>;
	pathForFile(file: File): string;
	openSource(id: string): Promise<void>;
	setCredential(token: string): Promise<void>;
	openExternal(url: string): Promise<void>;
}

declare global {
	interface Window {
		dsiDesktop?: DesktopBridge;
		dsiWorkspaceFlush?: () => Promise<void>;
	}
}
